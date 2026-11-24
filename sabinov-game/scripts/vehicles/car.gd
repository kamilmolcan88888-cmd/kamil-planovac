class_name Car
extends VehicleBody3D
## Drivable car on Godot's raycast vehicle (VehicleBody3D + VehicleWheel3D).
## Rear-wheel drive, speed-sensitive steering, handbrake, crash damage and
## running over pedestrians.
##
## Conventions of VehicleBody3D: the car drives towards its local +Z axis with
## a positive engine force, and a positive steering angle turns left. The
## driver's side (left) is therefore local +X.
##
## The car does not read the keyboard. Whoever drives it (player now, traffic
## AI later) writes input_throttle / input_steer / input_handbrake.

signal crashed(impact_speed: float)
signal health_changed(current: float, maximum: float)

@export_group("Engine")
## Peak drive force per driven wheel (N).
@export var max_engine_force := 2200.0
@export var top_speed := 40.0          # m/s (144 km/h)
@export var reverse_speed := 8.0       # m/s

@export_group("Brakes")
## Brake strength per wheel as impulse per physics tick (N*s at 60 Hz).
@export var brake_strength := 35.0
@export var handbrake_strength := 60.0
@export var rolling_resistance := 1.5

@export_group("Steering")
@export var steer_angle_low_speed := 0.6    # rad
@export var steer_angle_high_speed := 0.12  # rad, reached at steer_fade_speed
@export var steer_fade_speed := 25.0        # m/s
@export var steer_rate := 2.5               # rad/s

@export_group("Suspension")
@export var wheel_radius := 0.34
@export var suspension_rest := 0.2
@export var suspension_stiffness := 40.0
@export var damping_compression := 2.0
@export var damping_relaxation := 3.0
@export var grip_front := 2.0
@export var grip_rear := 1.8

@export_group("Damage")
@export var max_health := 100.0
## Velocity change within one tick (m/s) that counts as a crash.
@export var crash_threshold := 4.0
@export var run_over_speed := 3.0

@export_group("Look")
@export var paint := Color(0.55, 0.1, 0.1)

var driver: Node3D
var health := 100.0
var input_throttle := 0.0   # -1 (brake / reverse) .. 1 (accelerate)
var input_steer := 0.0      # -1 (right) .. 1 (left)
var input_handbrake := false

var _front_wheels: Array[VehicleWheel3D] = []
var _rear_wheels: Array[VehicleWheel3D] = []
var _hit_area: Area3D
var _paint_material: StandardMaterial3D
var _previous_velocity := Vector3.ZERO


func _ready() -> void:
	add_to_group("vehicles")
	collision_layer = Layers.VEHICLE
	# Characters are deliberately missing: a standing pedestrian must not stop
	# a car like a wall. They are handled by the hit area instead.
	collision_mask = Layers.WORLD | Layers.VEHICLE | Layers.PROP
	can_sleep = false   # a sleeping body would ignore the engine force
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector3(0.0, 0.05, 0.0)
	health = max_health
	_build_body()
	_build_wheels()
	_build_hit_area()


func forward_speed() -> float:
	return linear_velocity.dot(global_transform.basis.z)


func speed_kmh() -> float:
	return absf(forward_speed()) * 3.6


func set_driver(new_driver: Node3D) -> void:
	driver = new_driver
	if driver == null:
		input_throttle = 0.0
		input_steer = 0.0
		input_handbrake = false


func _physics_process(delta: float) -> void:
	_drive(delta)
	_detect_crash()
	_hit_pedestrians()


func _drive(delta: float) -> void:
	var speed := forward_speed()
	var has_driver := driver != null
	var throttle := input_throttle if has_driver else 0.0
	var handbrake := input_handbrake or not has_driver   # parked cars hold still

	var engine := 0.0
	var braking := rolling_resistance
	if throttle > 0.0:
		if speed < -0.5:
			braking = brake_strength * throttle
		else:
			engine = throttle * max_engine_force * clampf(1.0 - speed / top_speed, 0.0, 1.0)
	elif throttle < 0.0:
		if speed > 0.5:
			braking = brake_strength * -throttle
		else:
			engine = throttle * max_engine_force * 0.6 * clampf(1.0 + speed / reverse_speed, 0.0, 1.0)
	if health <= 0.0 or handbrake:
		engine = 0.0

	# Brakes only act on wheels without engine force, so set them after it.
	engine_force = engine
	brake = 0.0 if engine != 0.0 else braking
	if handbrake:
		for wheel in _rear_wheels:
			wheel.brake = handbrake_strength

	var fade := clampf(absf(speed) / steer_fade_speed, 0.0, 1.0)
	var max_angle := lerpf(steer_angle_low_speed, steer_angle_high_speed, fade)
	var target := (input_steer if has_driver else 0.0) * max_angle
	steering = move_toward(steering, target, steer_rate * delta)


func _detect_crash() -> void:
	var change := (linear_velocity - _previous_velocity).length()
	_previous_velocity = linear_velocity
	if change < crash_threshold:
		return
	health = maxf(health - (change - crash_threshold) * 8.0, 0.0)
	health_changed.emit(health, max_health)
	_paint_material.albedo_color = paint.darkened(0.7 * (1.0 - health / max_health))
	crashed.emit(change)


func _hit_pedestrians() -> void:
	var speed := linear_velocity.length()
	if speed < 0.8:
		return
	for body in _hit_area.get_overlapping_bodies():
		var person := body as Character
		if person == null or person == driver:
			continue
		var away := person.global_position - global_position
		away.y = 0.0
		if linear_velocity.dot(away) <= 0.0:
			continue   # driving away from them
		if speed < run_over_speed:
			person.shove(away.normalized() * (speed + 1.0))
		else:
			var damage := (speed - 2.0) * 6.0
			var impulse := linear_velocity.normalized() * maxf(speed * 60.0, Character.KNOCKDOWN_IMPULSE + 20.0)
			person.take_hit(damage, impulse + Vector3.UP * 150.0, self)


## Puts the car back on its wheels where it stands.
func reset_upright() -> void:
	var yaw := global_rotation.y
	global_transform = Transform3D(Basis(Vector3.UP, yaw), global_position + Vector3.UP * 1.0)
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	_previous_velocity = Vector3.ZERO


## Free spot next to the car for a character leaving it (driver's side first).
func get_exit_position() -> Vector3:
	var offsets: Array[Vector3] = [
		Vector3(1.6, 0.0, 0.0),
		Vector3(-1.6, 0.0, 0.0),
		Vector3(0.0, 0.0, -3.2),
		Vector3(0.0, 0.0, 3.2),
	]
	var flat := Basis(Vector3.UP, global_rotation.y)
	var ground_y := global_position.y - wheel_radius
	var capsule := CapsuleShape3D.new()
	capsule.radius = Character.RADIUS
	capsule.height = Character.HEIGHT - 0.2
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = capsule
	query.collision_mask = Layers.WORLD | Layers.VEHICLE | Layers.CHARACTER
	query.exclude = [get_rid()]
	var space := get_world_3d().direct_space_state
	for offset in offsets:
		var spot := global_position + flat * offset
		spot.y = ground_y + 0.15
		query.transform = Transform3D(Basis.IDENTITY, spot + Vector3.UP * (Character.HEIGHT * 0.5 + 0.15))
		if space.intersect_shape(query, 1).is_empty():
			return spot
	return global_position + Vector3.UP * 1.6   # boxed in: climb onto the roof


# --- construction -------------------------------------------------------------

func _box(size: Vector3, offset: Vector3, material: Material, with_collision: bool) -> void:
	var mesh := BoxMesh.new()
	mesh.size = size
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = material
	instance.position = offset
	add_child(instance)
	if with_collision:
		var shape := BoxShape3D.new()
		shape.size = size
		var collider := CollisionShape3D.new()
		collider.shape = shape
		collider.position = offset
		add_child(collider)


func _build_body() -> void:
	_paint_material = StandardMaterial3D.new()
	_paint_material.albedo_color = paint
	_paint_material.metallic = 0.4
	_paint_material.roughness = 0.35
	var glass := StandardMaterial3D.new()
	glass.albedo_color = Color(0.12, 0.16, 0.2)
	glass.roughness = 0.1
	var lamp := StandardMaterial3D.new()
	lamp.albedo_color = Color(1.0, 0.95, 0.7)
	lamp.emission_enabled = true
	lamp.emission = Color(1.0, 0.95, 0.7)
	var tail := StandardMaterial3D.new()
	tail.albedo_color = Color(0.8, 0.05, 0.05)

	_box(Vector3(1.6, 0.55, 4.2), Vector3(0.0, 0.225, 0.0), _paint_material, true)   # lower body
	_box(Vector3(1.5, 0.5, 2.0), Vector3(0.0, 0.75, -0.25), glass, true)             # cabin
	_box(Vector3(0.3, 0.14, 0.06), Vector3(0.6, 0.3, 2.1), lamp, false)              # headlights (+Z = front)
	_box(Vector3(0.3, 0.14, 0.06), Vector3(-0.6, 0.3, 2.1), lamp, false)
	_box(Vector3(0.3, 0.12, 0.06), Vector3(0.6, 0.32, -2.1), tail, false)            # tail lights
	_box(Vector3(0.3, 0.12, 0.06), Vector3(-0.6, 0.32, -2.1), tail, false)


func _build_wheels() -> void:
	var half_track := 0.86
	var half_wheelbase := 1.3
	_front_wheels.append(_wheel(Vector3(half_track, suspension_rest, half_wheelbase), true))
	_front_wheels.append(_wheel(Vector3(-half_track, suspension_rest, half_wheelbase), true))
	_rear_wheels.append(_wheel(Vector3(half_track, suspension_rest, -half_wheelbase), false))
	_rear_wheels.append(_wheel(Vector3(-half_track, suspension_rest, -half_wheelbase), false))


func _wheel(mount: Vector3, front: bool) -> VehicleWheel3D:
	var wheel := VehicleWheel3D.new()
	wheel.position = mount
	wheel.use_as_steering = front
	wheel.use_as_traction = not front
	wheel.wheel_radius = wheel_radius
	wheel.wheel_rest_length = suspension_rest
	wheel.suspension_travel = 0.2
	wheel.suspension_stiffness = suspension_stiffness
	wheel.suspension_max_force = mass * 10.0
	wheel.damping_compression = damping_compression
	wheel.damping_relaxation = damping_relaxation
	wheel.wheel_friction_slip = grip_front if front else grip_rear
	wheel.wheel_roll_influence = 0.1

	var tyre := CylinderMesh.new()
	tyre.top_radius = wheel_radius
	tyre.bottom_radius = wheel_radius
	tyre.height = 0.22
	var rubber := StandardMaterial3D.new()
	rubber.albedo_color = Color(0.08, 0.08, 0.08)
	var instance := MeshInstance3D.new()
	instance.mesh = tyre
	instance.material_override = rubber
	instance.rotation.z = PI * 0.5   # cylinder axis (Y) onto the axle (X)
	wheel.add_child(instance)
	add_child(wheel)
	return wheel


func _build_hit_area() -> void:
	_hit_area = Area3D.new()
	_hit_area.name = "HitArea"
	_hit_area.collision_layer = 0
	_hit_area.collision_mask = Layers.CHARACTER
	_hit_area.monitorable = false
	var shape := BoxShape3D.new()
	shape.size = Vector3(2.1, 1.0, 4.8)
	var collider := CollisionShape3D.new()
	collider.shape = shape
	collider.position = Vector3(0.0, 0.4, 0.0)
	_hit_area.add_child(collider)
	add_child(_hit_area)
