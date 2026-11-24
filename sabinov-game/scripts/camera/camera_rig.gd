class_name CameraRig
extends Node3D
## Third-person orbit camera. The mouse turns it around the target; a spring
## arm keeps it from clipping into walls. Behind a moving car it re-centres on
## its own after a moment without mouse input.

@export var mouse_sensitivity := 0.0025
@export var distance_on_foot := 3.4
@export var distance_in_car := 6.8
@export var height_on_foot := 1.55
@export var height_in_car := 1.4
@export var follow_speed := 18.0
@export var recenter_delay := 1.2

var target: Node3D
## Horizontal angle of the view (rad). The player moves relative to it.
var yaw := 0.0
var pitch := -0.3

var _arm: SpringArm3D
var _camera: Camera3D
var _idle := 0.0


func _ready() -> void:
	_arm = SpringArm3D.new()
	_arm.spring_length = distance_on_foot
	_arm.collision_mask = Layers.WORLD
	_arm.margin = 0.15
	var probe := SphereShape3D.new()
	probe.radius = 0.2
	_arm.shape = probe
	add_child(_arm)
	_camera = Camera3D.new()
	_camera.fov = 70.0
	_camera.far = 800.0
	_arm.add_child(_camera)
	_camera.current = true


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var motion := event as InputEventMouseMotion
		yaw = wrapf(yaw - motion.relative.x * mouse_sensitivity, -PI, PI)
		pitch = clampf(pitch - motion.relative.y * mouse_sensitivity, -1.2, 0.5)
		_idle = 0.0


func _process(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	var car := _target_car()
	var in_car := car != null
	_idle += delta

	if in_car and _idle > recenter_delay and car.linear_velocity.length() > 2.0:
		# Look along the car's direction of travel (+Z is its front).
		var heading := car.global_transform.basis.z
		var behind := atan2(-heading.x, -heading.z)
		yaw = lerp_angle(yaw, behind, clampf(2.5 * delta, 0.0, 1.0))
		pitch = lerpf(pitch, -0.25, clampf(2.0 * delta, 0.0, 1.0))

	var blend := clampf(8.0 * delta, 0.0, 1.0)
	_arm.spring_length = lerpf(_arm.spring_length, distance_in_car if in_car else distance_on_foot, blend)
	var height := height_in_car if in_car else height_on_foot
	var goal := target.global_position + Vector3.UP * height
	global_position = global_position.lerp(goal, clampf(follow_speed * delta, 0.0, 1.0))
	rotation = Vector3(pitch, yaw, 0.0)


func snap_to_target() -> void:
	if target != null:
		global_position = target.global_position + Vector3.UP * height_on_foot


func _target_car() -> Car:
	var player := target as Player
	if player != null:
		return player.vehicle
	return null
