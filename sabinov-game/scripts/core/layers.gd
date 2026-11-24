class_name Layers
extends RefCounted
## Physics layer bit values. Names are mirrored in project.godot ([layer_names]).

const WORLD := 1       # static geometry: ground, sidewalks, buildings
const VEHICLE := 2     # cars
const CHARACTER := 4   # player and NPCs while standing
const PROP := 8        # loose rigid bodies and knocked-down characters
