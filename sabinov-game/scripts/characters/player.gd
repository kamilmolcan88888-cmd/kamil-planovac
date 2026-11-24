class_name Player
extends Character
## Keyboard and mouse control of a Character, plus entering and leaving cars.

signal vehicle_changed(car: Car)

const INTERACT_RANGE := 3.0
const AUTO_AIM_RANGE := 2.2

var camera_rig: CameraRig
var vehicle: Car
## Closest car the player could enter right now (null when none is in range).
var nearby_car: Car
var spawn_point := Vector3.ZERO


func _ready() -> void:
	super._ready()
	add_to_group("player")


func _update_intent(delta: float) -> void:
	var input := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var yaw := camera_rig.yaw if camera_rig != null else 0.0
	wish_dir = Basis(Vector3.UP, yaw) * Vector3(input.x, 0.0, input.y)

	if Input.is_action_pressed("sprint"):
		wish_gait = Gait.SPRINT
	elif Input.is_action_pressed("walk"):
		wish_gait = Gait.WALK
	else:
		wish_gait = Gait.JOG

	if Input.is_action_just_pressed("jump"):
		wish_jump = true

	var mouse_captured := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	set_blocking(mouse_captured and Input.is_action_pressed("block"))
	if mouse_captured and Input.is_action_just_pressed("attack"):
		_aim_at_nearest_target(delta)
		try_attack()

	nearby_car = _find_nearby_car()
	if Input.is_action_just_pressed("interact") and nearby_car != null:
		enter_vehicle(nearby_car)
	elif Input.is_action_just_pressed("reset_position"):
		revive(spawn_point)


func _vehicle_tick(_delta: float) -> void:
	if vehicle == null:
		return
	global_position = vehicle.global_position
	vehicle.input_throttle = Input.get_axis("move_back", "move_forward")
	vehicle.input_steer = Input.get_axis("move_right", "move_left")
	vehicle.input_handbrake = Input.is_action_pressed("handbrake")
	if Input.is_action_just_pressed("reset_position"):
		vehicle.reset_upright()
	if Input.is_action_just_pressed("interact"):
		exit_vehicle()


func _unhandled_input(event: InputEvent) -> void:
	# Lets a dead player respawn (no intent is read while knocked down).
	if event.is_action_pressed("reset_position") and state == State.DEAD:
		revive(spawn_point)


## Turns towards the closest character in front so punches connect.
func _aim_at_nearest_target(_delta: float) -> void:
	var best: Character = null
	var best_distance := AUTO_AIM_RANGE
	for node in get_tree().get_nodes_in_group("characters"):
		var other := node as Character
		if other == null or other == self or other.state != State.ACTIVE:
			continue
		var distance := global_position.distance_to(other.global_position)
		if distance < best_distance:
			best_distance = distance
			best = other
	if best != null:
		var to_target := best.global_position - global_position
		rotation.y = atan2(-to_target.x, -to_target.z)


func _find_nearby_car() -> Car:
	var best: Car = null
	var best_distance := INTERACT_RANGE
	for node in get_tree().get_nodes_in_group("vehicles"):
		var car := node as Car
		if car == null or car.driver != null:
			continue
		var distance := global_position.distance_to(car.global_position)
		if distance < best_distance:
			best_distance = distance
			best = car
	return best


func enter_vehicle(car: Car) -> void:
	vehicle = car
	nearby_car = null
	state = State.IN_VEHICLE
	visible = false
	velocity = Vector3.ZERO
	is_blocking = false
	_arm_left.rotation.x = 0.0
	_arm_right.rotation.x = 0.0
	_collider.set_deferred("disabled", true)
	car.set_driver(self)
	if not car.crashed.is_connected(_on_vehicle_crashed):
		car.crashed.connect(_on_vehicle_crashed)
	vehicle_changed.emit(car)


func exit_vehicle() -> void:
	if vehicle == null:
		return
	var car := vehicle
	var spot := car.get_exit_position()
	if car.crashed.is_connected(_on_vehicle_crashed):
		car.crashed.disconnect(_on_vehicle_crashed)
	car.set_driver(null)
	vehicle = null
	global_position = spot
	rotation = Vector3(0.0, car.global_rotation.y + PI, 0.0)
	velocity = Vector3.ZERO
	visible = true
	_collider.set_deferred("disabled", false)
	state = State.ACTIVE
	vehicle_changed.emit(null)


## A crash hurts the driver; a fatal one throws them out of the car.
func _on_vehicle_crashed(impact_speed: float) -> void:
	if state != State.IN_VEHICLE or vehicle == null:
		return
	var damage := maxf(impact_speed - 6.0, 0.0) * 5.0
	if damage <= 0.0:
		return
	if health - damage > 0.0:
		_apply_damage(damage)
		return
	var thrown := vehicle.linear_velocity * MASS * 0.5
	exit_vehicle()
	take_hit(damage, thrown, null)
