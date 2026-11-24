class_name Npc
extends Character
## Simple pedestrian: strolls along a route, fights back or runs when attacked.
## Movement is straight-line steering; swap _steer_to() for a NavigationAgent3D
## once the map has a navigation mesh.

enum Mood { CALM, FIGHT, FLEE }

const ARRIVE_DISTANCE := 0.7
const FIGHT_DISTANCE := 1.0
const GIVE_UP_DISTANCE := 15.0
const SAFE_DISTANCE := 30.0

## Aggressive pedestrians hit back; the others run away.
@export var aggressive := true

var route: Array[Vector3] = []
var mood: Mood = Mood.CALM

var _threat: Node3D
var _route_index := 0
var _route_step := 1
var _wait := 0.0
var _reaction := 0.0
var _mood_timer := 0.0


func _ready() -> void:
	super._ready()
	add_to_group("npcs")
	_wait = randf_range(0.0, 2.0)
	got_up.connect(_on_got_up)


func _update_intent(delta: float) -> void:
	wish_jump = false
	match mood:
		Mood.CALM:
			_stroll(delta)
		Mood.FIGHT:
			_fight(delta)
		Mood.FLEE:
			_flee(delta)


func _stroll(delta: float) -> void:
	wish_gait = Gait.WALK
	if route.is_empty() or _wait > 0.0:
		_wait -= delta
		wish_dir = Vector3.ZERO
		return
	var target := route[_route_index]
	if _flat_distance(target) < ARRIVE_DISTANCE:
		# Walk the route back and forth.
		if _route_index + _route_step < 0 or _route_index + _route_step >= route.size():
			_route_step = -_route_step
		_route_index = clampi(_route_index + _route_step, 0, route.size() - 1)
		_wait = randf_range(1.0, 4.0)
		wish_dir = Vector3.ZERO
		return
	_steer_to(target)


func _fight(delta: float) -> void:
	if _threat == null or not is_instance_valid(_threat):
		_calm_down()
		return
	var enemy := _threat as Character
	if enemy == null or enemy.state != State.ACTIVE:
		_calm_down()
		return
	var distance := _flat_distance(enemy.global_position)
	if distance > GIVE_UP_DISTANCE:
		_calm_down()
		return
	if distance > FIGHT_DISTANCE:
		wish_gait = Gait.JOG
		set_blocking(false)
		_steer_to(enemy.global_position)
		return
	wish_dir = Vector3.ZERO
	face_towards(enemy.global_position, delta)
	_reaction -= delta
	if _reaction <= 0.0:
		_reaction = randf_range(0.45, 1.1)
		if randf() < 0.3:
			set_blocking(true)
		else:
			set_blocking(false)
			try_attack()


func _flee(delta: float) -> void:
	_mood_timer -= delta
	if _threat == null or not is_instance_valid(_threat) or _mood_timer <= 0.0:
		_calm_down()
		return
	var away := global_position - _threat.global_position
	away.y = 0.0
	if away.length() > SAFE_DISTANCE:
		_calm_down()
		return
	wish_gait = Gait.SPRINT
	wish_dir = away.normalized() if away.length_squared() > 0.01 else Vector3.FORWARD


func _steer_to(target: Vector3) -> void:
	var to_target := target - global_position
	to_target.y = 0.0
	wish_dir = to_target.normalized() if to_target.length_squared() > 0.01 else Vector3.ZERO


func _flat_distance(target: Vector3) -> float:
	var offset := target - global_position
	offset.y = 0.0
	return offset.length()


func _calm_down() -> void:
	mood = Mood.CALM
	_threat = null
	set_blocking(false)
	_wait = randf_range(1.0, 3.0)


func _on_hit(damage: float, attacker: Node) -> void:
	var source := attacker as Node3D
	if source == null:
		return
	_threat = source
	_mood_timer = 10.0
	if aggressive and source is Character and health > max_health * 0.3:
		mood = Mood.FIGHT
		_reaction = randf_range(0.2, 0.5)
	else:
		mood = Mood.FLEE
	if damage > 0.0:
		# Everyone nearby sees the attack.
		get_tree().call_group("npcs", "witness", self, source)


## Called on all NPCs when one of them is attacked.
func witness(victim: Npc, attacker: Node3D) -> void:
	if victim == self or state != State.ACTIVE or mood != Mood.CALM:
		return
	if global_position.distance_to(victim.global_position) > 12.0:
		return
	_threat = attacker
	_mood_timer = 8.0
	mood = Mood.FLEE


func _on_got_up() -> void:
	# After being run over nobody wants to fight a car.
	if _threat != null and is_instance_valid(_threat) and not (_threat is Character):
		mood = Mood.FLEE
		_mood_timer = 8.0
