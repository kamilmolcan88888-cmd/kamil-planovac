class_name Geo
extends RefCounted
## Conversion between GPS coordinates and the local metric frame of a map.
##
## Map files store points as [east, north] in metres from the map origin.
## In the 3D world: x = east, z = -north, y = up (1 unit = 1 metre).
## The projection is a local tangent plane; its error stays below a few
## centimetres within ~2 km of the origin, which covers all of Sabinov.

const EARTH_RADIUS := 6378137.0


static func latlon_to_en(lat: float, lon: float, origin_lat: float, origin_lon: float) -> Vector2:
	var east := deg_to_rad(lon - origin_lon) * EARTH_RADIUS * cos(deg_to_rad(origin_lat))
	var north := deg_to_rad(lat - origin_lat) * EARTH_RADIUS
	return Vector2(east, north)


## Returns Vector2(lat, lon).
static func en_to_latlon(east: float, north: float, origin_lat: float, origin_lon: float) -> Vector2:
	var lat := origin_lat + rad_to_deg(north / EARTH_RADIUS)
	var lon := origin_lon + rad_to_deg(east / (EARTH_RADIUS * cos(deg_to_rad(origin_lat))))
	return Vector2(lat, lon)


static func en_to_world(en: Vector2, y: float = 0.0) -> Vector3:
	return Vector3(en.x, y, -en.y)


static func world_to_en(pos: Vector3) -> Vector2:
	return Vector2(pos.x, -pos.z)


## Compass heading (degrees clockwise from north) -> rotation.y of a node whose
## forward axis is -Z (characters, cameras).
static func heading_to_yaw(heading_deg: float) -> float:
	return -deg_to_rad(heading_deg)


## Same for nodes whose forward axis is +Z (VehicleBody3D).
static func heading_to_vehicle_yaw(heading_deg: float) -> float:
	return PI - deg_to_rad(heading_deg)
