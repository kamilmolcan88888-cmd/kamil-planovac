class_name Character
extends CharacterBody3D
## Shared base of the player and NPCs: locomotion (walk / jog / sprint / jump,
## kerbs and stairs), stamina, health, melee and physical knock-down.
##
## Subclasses only decide what the character wants to do each physics tick by
## filling the wish_* variables in _update_intent().

signal health_changed(current: float, maximum: float)
signal knocked_down
signal got_up
signal died

enum State { ACTIVE, KNOCKED_DOWN, DEAD, IN_VEHICLE }
enum Gait { WALK, JOG, SPRINT }

const HEIGHT := 1.8
const RADIUS := 0.3
const MASS := 75.0
const COYOTE_TIME := 0.12
const JUMP_BUFFER := 0.12
const KNOCKDOWN_IMPULSE := 500.0

@export_group("Locomotion")
@export var walk_speed := 1.6
@export var jog_speed := 3.6
@export var sprint_speed := 6.5
@export var acceleration := 18.0
@export var deceleration := 22.0
@export var air_control := 0.25
@export var turn_speed := 10.0
@export var jump_height := 1.0
@export var step_height := 0.3
## Force (N) applied to loose rigid bodies the character walks into.
@export var push_force := 300.0

@export_group("Stamina")
@export var max_stamina := 100.0
@export var stamina_drain := 18.0
@export var stamina_regen := 12.0

@export_group("Combat")
@export var max_health := 100.0
@export var punch_damage := 12.0
@export var heavy_punch_damage := 24.0
@export var punch_range := 1.1
@export var punch_cooldown := 0.4
@export var block_damage_factor := 0.2
## A single hit with at least this much damage knocks the character down.
@export var knockdown_damage := 30.0
@export var get_up_time := 3.0

@export_group("Look")
@export var body_color := Color(0.25, 0.35, 0.6)

var state: State = State.ACTIVE
var health := 100.0
var stamina := 100.0
var is_blocking := false
var is_sprinting := false

# Intent, written by subclasses in _update_intent().
var wish_dir := Vector3.ZERO      # world space, horizontal, length 0..1
var wish_gait: Gait = Gait.JOG
var wish_jump := false

var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)
var _coyote := 0.0
var _jump_buffer := 0.0
var _attack_cooldown := 0.0
var _attack_lock := 0.0
var _combo := 0
var _combo_timer := 0.0
var _use_left_arm := false
var _down_timer := 0.0

var _visual: Node3D
var _collider: CollisionShape3D
var _arm_left: Node3D
var _arm_right: Node3D
var _body_material: StandardMaterial3D
var _ragdoll: RigidBody3D


func _ready() -> void:
	add_to_group("characters")
	collision_layer = Layers.CHARACTER
	collision_mask = Layers.WORLD | Layers.VEHICLE | Layers.CHARACTER | Layers.PROP
	floor_max_angle = deg_to_rad(50.0)
	floor_snap_length = step_height + 0.05
	health = max_health
	stamina = max_stamina
	_build_body()


func _physics_process(delta: float) -> void:
	_attack_cooldown = maxf(_attack_cooldown - delta, 0.0)
	_attack_lock = maxf(_attack_lock - delta, 0.0)
	_combo_timer = maxf(_combo_timer - delta, 0.0)
	match state:
		State.ACTIVE:
			_update_intent(delta)
			# _update_intent may have changed the state (entering a car).
			if state == State.ACTIVE:
				_locomotion(delta)
		State.KNOCKED_DOWN, State.DEAD:
			_knockdown_tick(delta)
		State.IN_VEHICLE:
			_vehicle_tick(delta)


# --- hooks for subclasses -----------------------------------------------------

func _update_intent(_delta: float) -> void:
	pass


func _vehicle_tick(_delta: float) -> void:
	pass


func _on_hit(_damage: float, _attacker: Node) -> void:
	pass


# --- body ---------------------------------------------------------------------

func _build_body() -> void:
	var capsule := CapsuleShape3D.new()
	capsule.radius = RADIUS
	capsule.height = HEIGHT
	_collider = CollisionShape3D.new()
	_collider.shape = capsule
	_collider.position.y = HEIGHT * 0.5
	add_child(_collider)

	_visual = Node3D.new()
	_visual.name = "Visual"
	add_child(_visual)

	_body_material = StandardMaterial3D.new()
	_body_material.albedo_color = body_color
	var skin := StandardMaterial3D.new()
	skin.albedo_color = Color(0.87, 0.72, 0.6)

	var torso := CapsuleMesh.new()
	torso.radius = 0.24
	torso.height = 1.5
	_visual.add_child(_part(torso, _body_material, Vector3(0, 0.75, 0)))

	var head := SphereMesh.new()
	head.radius = 0.14
	head.height = 0.28
	_visual.add_child(_part(head, skin, Vector3(0, 1.64, 0)))

	# The nose shows which way the character faces (-Z).
	var nose := BoxMesh.new()
	nose.size = Vector3(0.07, 0.06, 0.1)
	_visual.add_child(_part(nose, skin, Vector3(0, 1.63, -0.16)))

	_arm_left = _build_arm(-0.31, skin)
	_arm_right = _build_arm(0.31, skin)


func _part(mesh: Mesh, material: Material, offset: Vector3) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = material
	instance.position = offset
	return instance


## An arm hangs from a shoulder pivot; rotation.x = +90 degrees points it forward.
func _build_arm(side: float, skin: Material) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = Vector3(side, 1.36, 0)
	var arm := BoxMesh.new()
	arm.size = Vector3(0.1, 0.56, 0.1)
	pivot.add_child(_part(arm, _body_material, Vector3(0, -0.28, 0)))
	var fist := SphereMesh.new()
	fist.radius = 0.07
	fist.height = 0.14
	pivot.add_child(_part(fist, skin, Vector3(0, -0.6, 0)))
	_visual.add_child(pivot)
	return pivot


func set_body_color(color: Color) -> void:
	body_color = color
	if _body_material != null:
		_body_material.albedo_color = color


# --- locomotion ---------------------------------------------------------------

func _locomotion(delta: float) -> void:
	var on_floor := is_on_floor()
	var moving := wish_dir.length_squared() > 0.01

	is_sprinting = wish_gait == Gait.SPRINT and moving and stamina > 0.0 and not is_blocking
	if is_sprinting:
		stamina = maxf(stamina - stamina_drain * delta, 0.0)
	else:
		stamina = minf(stamina + stamina_regen * delta, max_stamina)

	var target_speed := jog_speed
	if is_blocking or wish_gait == Gait.WALK:
		target_speed = walk_speed
	elif is_sprinting:
		target_speed = sprint_speed
	if _attack_lock > 0.0:
		target_speed *= 0.3

	var horizontal := Vector3(velocity.x, 0.0, velocity.z)
	var rate := acceleration if moving else deceleration
	if not on_floor:
		rate *= air_control
	horizontal = horizontal.move_toward(wish_dir * target_speed, rate * delta)
	velocity.x = horizontal.x
	velocity.z = horizontal.z

	if on_floor:
		_coyote = COYOTE_TIME
	else:
		_coyote = maxf(_coyote - delta, 0.0)
		velocity.y -= _gravity * delta

	if wish_jump:
		_jump_buffer = JUMP_BUFFER
		wish_jump = false
	else:
		_jump_buffer = maxf(_jump_buffer - delta, 0.0)
	if _jump_buffer > 0.0 and _coyote > 0.0:
		velocity.y = sqrt(2.0 * _gravity * jump_height)
		_jump_buffer = 0.0
		_coyote = 0.0

	if moving and _attack_lock <= 0.0:
		var target_yaw := atan2(-wish_dir.x, -wish_dir.z)
		rotation.y = lerp_angle(rotation.y, target_yaw, clampf(turn_speed * delta, 0.0, 1.0))

	_try_step_up(delta)
	move_and_slide()
	_push_rigid_bodies(delta)


## Lifts the body onto low obstacles (kerbs, stairs) it would otherwise bump
## into. The floor snap of move_and_slide() puts it back down afterwards.
func _try_step_up(delta: float) -> void:
	if not is_on_floor() or velocity.y > 0.1:
		return
	var motion := Vector3(velocity.x, 0.0, velocity.z) * delta
	if motion.length_squared() < 0.000001:
		return
	var from := global_transform
	var hit := KinematicCollision3D.new()
	if not test_move(from, motion, hit):
		return
	# Walkable slopes are handled by move_and_slide() itself.
	if hit.get_normal().y > cos(floor_max_angle):
		return
	var lift := Vector3.UP * step_height
	if test_move(from, lift):
		return
	if test_move(from.translated(lift), motion):
		return
	global_position += lift


func _push_rigid_bodies(delta: float) -> void:
	for i in get_slide_collision_count():
		var collision := get_slide_collision(i)
		var body := collision.get_collider() as RigidBody3D
		if body == null or body is VehicleBody3D:
			continue
		var direction := -collision.get_normal()
		direction.y = 0.0
		body.apply_impulse(direction * push_force * delta, collision.get_position() - body.global_position)


func forward() -> Vector3:
	return -global_transform.basis.z


func face_towards(target: Vector3, delta: float) -> void:
	var to_target := target - global_position
	to_target.y = 0.0
	if to_target.length_squared() < 0.0001:
		return
	var target_yaw := atan2(-to_target.x, -to_target.z)
	rotation.y = lerp_angle(rotation.y, target_yaw, clampf(turn_speed * delta, 0.0, 1.0))


## Pushes the character without hurting it (slow car, crowd).
func shove(push_velocity: Vector3) -> void:
	if state != State.ACTIVE:
		return
	velocity.x = push_velocity.x
	velocity.z = push_velocity.z


# --- combat -------------------------------------------------------------------

func set_blocking(value: bool) -> void:
	if value == is_blocking or state != State.ACTIVE:
		return
	if value and _attack_lock > 0.0:
		return
	is_blocking = value
	var angle := deg_to_rad(115.0) if value else 0.0
	var tween := create_tween().set_parallel(true)
	tween.tween_property(_arm_left, "rotation:x", angle, 0.12)
	tween.tween_property(_arm_right, "rotation:x", angle, 0.12)


## Starts a punch. Every third punch in a quick series is a heavy one.
func try_attack() -> bool:
	if state != State.ACTIVE or _attack_cooldown > 0.0 or is_blocking:
		return false
	_combo = _combo + 1 if _combo_timer > 0.0 else 1
	var heavy := _combo >= 3
	if heavy:
		_combo = 0
	_combo_timer = 0.9
	_attack_cooldown = punch_cooldown * (1.6 if heavy else 1.0)
	_attack_lock = 0.25
	_use_left_arm = not _use_left_arm

	var arm := _arm_left if _use_left_arm else _arm_right
	var tween := create_tween()
	tween.tween_property(arm, "rotation:x", deg_to_rad(95.0), 0.1)
	tween.tween_property(arm, "rotation:x", 0.0, 0.35 if heavy else 0.2)

	# The hit lands at the end of the wind-up.
	get_tree().create_timer(0.1, false, true).timeout.connect(_resolve_punch.bind(heavy))
	return true


func _resolve_punch(heavy: bool) -> void:
	if state != State.ACTIVE:
		return
	var direction := forward()
	var sphere := SphereShape3D.new()
	sphere.radius = punch_range * 0.5
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = sphere
	query.transform = Transform3D(Basis.IDENTITY, global_position + Vector3.UP * 1.2 + direction * punch_range * 0.6)
	query.collision_mask = Layers.CHARACTER | Layers.PROP
	query.exclude = [get_rid()]
	var hits := get_world_3d().direct_space_state.intersect_shape(query, 8)
	for hit: Dictionary in hits:
		var target: Object = hit.get("collider")
		if target is Character:
			var damage := heavy_punch_damage if heavy else punch_damage
			var impulse := direction * (320.0 if heavy else 160.0) + Vector3.UP * 20.0
			(target as Character).take_hit(damage, impulse, self)
		elif target is RigidBody3D:
			(target as RigidBody3D).apply_central_impulse(direction * 60.0)


## Entry point for all damage. `impulse` is in N*s (mass x velocity change).
func take_hit(damage: float, impulse: Vector3, attacker: Node = null) -> void:
	if state == State.DEAD or state == State.IN_VEHICLE:
		return
	if state == State.KNOCKED_DOWN:
		if _ragdoll != null:
			_ragdoll.apply_central_impulse(impulse)
		_apply_damage(damage)
		if health <= 0.0:
			_die()
		return

	if is_blocking and attacker is Character:
		var to_attacker := (attacker as Character).global_position - global_position
		to_attacker.y = 0.0
		if to_attacker.normalized().dot(forward()) > 0.3:
			damage *= block_damage_factor
			impulse *= 0.3

	_apply_damage(damage)
	_on_hit(damage, attacker)
	if health <= 0.0:
		_knock_down(impulse)
		_die()
	elif damage >= knockdown_damage or impulse.length() >= KNOCKDOWN_IMPULSE:
		_knock_down(impulse)
	else:
		velocity += impulse / MASS


func _apply_damage(damage: float) -> void:
	if damage <= 0.0:
		return
	health = maxf(health - damage, 0.0)
	health_changed.emit(health, max_health)
	if _body_material != null:
		create_tween().tween_property(_body_material, "albedo_color", body_color, 0.3).from(Color(1.0, 0.25, 0.2))


# --- knock-down ---------------------------------------------------------------

## Replaces the kinematic body with a tumbling rigid body until the character
## gets up again. This is the hook for a real skeleton ragdoll later.
func _knock_down(impulse: Vector3) -> void:
	if state == State.KNOCKED_DOWN or state == State.DEAD:
		return
	var carried_velocity := velocity
	state = State.KNOCKED_DOWN
	is_blocking = false
	_down_timer = get_up_time
	velocity = Vector3.ZERO
	_collider.set_deferred("disabled", true)
	_arm_left.rotation.x = 0.0
	_arm_right.rotation.x = 0.0

	_ragdoll = RigidBody3D.new()
	_ragdoll.name = "Ragdoll"
	_ragdoll.mass = MASS
	_ragdoll.collision_layer = Layers.PROP
	_ragdoll.collision_mask = Layers.WORLD | Layers.VEHICLE | Layers.PROP
	_ragdoll.angular_damp = 2.0
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.25
	capsule.height = HEIGHT - 0.1
	var shape := CollisionShape3D.new()
	shape.shape = capsule
	_ragdoll.add_child(shape)
	get_parent().add_child(_ragdoll)
	_ragdoll.global_transform = Transform3D(global_transform.basis, global_position + Vector3.UP * HEIGHT * 0.5)

	_visual.reparent(_ragdoll, false)
	_visual.transform = Transform3D(Basis.IDENTITY, Vector3(0, -HEIGHT * 0.5, 0))

	_ragdoll.linear_velocity = carried_velocity + impulse / MASS
	_ragdoll.angular_velocity = Vector3(randf_range(-4.0, 4.0), randf_range(-1.0, 1.0), randf_range(-4.0, 4.0))
	knocked_down.emit()


func _knockdown_tick(delta: float) -> void:
	if _ragdoll == null:
		return
	# Keep the logical position on the body so cameras and AI can follow it.
	global_position = _ragdoll.global_position
	if state == State.DEAD:
		return
	_down_timer -= delta
	if _down_timer <= 0.0 and _ragdoll.linear_velocity.length() < 0.5:
		_get_up()


func _get_up() -> void:
	var rest := _ragdoll.global_position
	var yaw := _ragdoll.global_rotation.y
	_visual.reparent(self, false)
	_visual.transform = Transform3D.IDENTITY
	_ragdoll.queue_free()
	_ragdoll = null
	global_position = rest + Vector3.UP * 0.1
	rotation = Vector3(0.0, yaw, 0.0)
	velocity = Vector3.ZERO
	_collider.set_deferred("disabled", false)
	state = State.ACTIVE
	got_up.emit()


func _die() -> void:
	if state == State.DEAD:
		return
	state = State.DEAD
	died.emit()


## Brings a dead or knocked-down character back, standing at `spot`.
func revive(spot: Vector3) -> void:
	if _ragdoll != null:
		_visual.reparent(self, false)
		_visual.transform = Transform3D.IDENTITY
		_ragdoll.queue_free()
		_ragdoll = null
	global_position = spot
	rotation = Vector3.ZERO
	velocity = Vector3.ZERO
	health = max_health
	stamina = max_stamina
	_collider.set_deferred("disabled", false)
	state = State.ACTIVE
	health_changed.emit(health, max_health)
