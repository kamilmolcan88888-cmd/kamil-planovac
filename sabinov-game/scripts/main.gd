extends Node3D
## Entry scene: builds the street from a map file and spawns the player,
## cars, pedestrians, camera and HUD. Everything a level needs is described
## in the map JSON, so a new district is a new file, not new code.

const MAP_PATH := "res://data/maps/komenskeho_18.json"
const PLAYER_SCENE := preload("res://scenes/player.tscn")
const NPC_SCENE := preload("res://scenes/npc.tscn")
const CAR_SCENE := preload("res://scenes/car.tscn")

const CAR_PAINTS: Array[Color] = [
	Color(0.55, 0.1, 0.1),
	Color(0.12, 0.2, 0.4),
	Color(0.75, 0.75, 0.72),
	Color(0.1, 0.3, 0.18),
]
const NPC_COLORS: Array[Color] = [
	Color(0.5, 0.2, 0.2),
	Color(0.2, 0.45, 0.3),
	Color(0.55, 0.5, 0.2),
	Color(0.4, 0.3, 0.5),
	Color(0.3, 0.3, 0.3),
]

var map: Dictionary = {}
var world: WorldBuilder
var player: Player
var camera_rig: CameraRig


func _ready() -> void:
	_build_environment()
	map = WorldBuilder.load_map(MAP_PATH)
	world = WorldBuilder.new()
	world.name = "World"
	add_child(world)
	world.build(map)

	var spawns: Dictionary = _dict(map.get("spawns", {}))
	_spawn_cars(_array(spawns.get("cars", [])))
	_spawn_npcs(_array(spawns.get("npcs", [])))
	_spawn_player(_dict(spawns.get("player", {})))

	var hud := Hud.new()
	hud.name = "Hud"
	hud.player = player
	hud.map = map
	add_child(hud)


func _dict(value: Variant) -> Dictionary:
	if typeof(value) == TYPE_DICTIONARY:
		return value
	return {}


func _array(value: Variant) -> Array:
	if typeof(value) == TYPE_ARRAY:
		return value
	return []


func _build_environment() -> void:
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.3, 0.5, 0.8)
	sky_material.sky_horizon_color = Color(0.7, 0.8, 0.9)
	sky_material.ground_horizon_color = Color(0.7, 0.8, 0.9)
	sky_material.ground_bottom_color = Color(0.3, 0.35, 0.3)
	var sky := Sky.new()
	sky.sky_material = sky_material
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var world_environment := WorldEnvironment.new()
	world_environment.environment = environment
	add_child(world_environment)

	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-50.0, -35.0, 0.0)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 150.0
	add_child(sun)


func _spawn_player(data: Dictionary) -> void:
	player = PLAYER_SCENE.instantiate() as Player
	player.name = "Player"
	var spot := WorldBuilder.world_pos(data.get("pos", [0, 0]), 0.2)
	add_child(player)
	player.global_position = spot
	player.rotation.y = Geo.heading_to_yaw(float(data.get("heading", 0.0)))
	player.spawn_point = spot
	Game.player = player

	camera_rig = CameraRig.new()
	camera_rig.name = "CameraRig"
	add_child(camera_rig)
	camera_rig.target = player
	camera_rig.yaw = player.rotation.y
	camera_rig.snap_to_target()
	player.camera_rig = camera_rig


func _spawn_cars(cars: Array) -> void:
	for i in cars.size():
		var data := _dict(cars[i])
		var car := CAR_SCENE.instantiate() as Car
		car.name = "Car%d" % (i + 1)
		car.paint = CAR_PAINTS[i % CAR_PAINTS.size()]
		# Dropped from a little above the ground so the suspension settles.
		car.position = WorldBuilder.world_pos(data.get("pos", [0, 0]), 0.6)
		car.rotation.y = Geo.heading_to_vehicle_yaw(float(data.get("heading", 0.0)))
		add_child(car)


func _spawn_npcs(npcs: Array) -> void:
	var routes := _array(map.get("npc_routes", []))
	for i in npcs.size():
		var data := _dict(npcs[i])
		var npc := NPC_SCENE.instantiate() as Npc
		npc.name = "Npc%d" % (i + 1)
		npc.body_color = NPC_COLORS[i % NPC_COLORS.size()]
		npc.aggressive = bool(data.get("aggressive", true))
		npc.position = WorldBuilder.world_pos(data.get("pos", [0, 0]), 0.2)
		var route_index := int(data.get("route", -1))
		if route_index >= 0 and route_index < routes.size():
			for waypoint: Variant in _array(routes[route_index]):
				npc.route.append(WorldBuilder.world_pos(waypoint))
		add_child(npc)
