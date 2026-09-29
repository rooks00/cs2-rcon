import type { ServerMap } from "@/lib/types";

// User-supplied catalog. Groups describe the supplied list, not live queue status.
export const WORKSHOP_GROUPS: { name: string; maps: ServerMap[] }[] = [
  ["Old list · small file size", [
    ["Extraction", "3460964702"], ["Lake", "3070563536"], ["Bank", "3070581293"],
    ["Shortdust", "3070612859"], ["Safehouse", "3070550406"], ["St. Marc", "3070562370"],
    ["Sugarcane", "3070579459"], ["Pool Day", "3070923343"], ["Agency", "3339983232"],
  ]],
  ["Classic ports (1.6 / Source / CS:GO)", [
    ["Assault", "3694043544"], ["Aztec", "3079692971"], ["Siege", "3549920903"],
    ["Maginot", "3195399109"], ["Mocha", "3552466076"], ["Cache", "3437809122"],
    ["Insertion II", "3236615060"], ["Safehouse", "3542772009"], ["Shortdust", "3618786679"],
    ["Lake", "3219506727"], ["Pool Day (Classic)", "3070923343"], ["Pool Day (Arms Race)", "3263935964"],
    ["fy_iceworld", "3070238628"], ["mini mirage", "3099519038"], ["Brownstone", "3663976049"],
  ]],
  ["Cross-game ports (TF2 / CoD / Skyrim)", [
    ["Junction", "3253069944"], ["Barnblitz", "3493648354"], ["Shipment", "3472828046"], ["Whiterun", "3114023815"],
  ]],
  ["Officially featured · Season 5 / Wingman", [
    ["Boulder", "3663186989"], ["Fachwerk", "3442040035"], ["Debris", "3539217452"],
    ["El Dorado", "3408790618"], ["Poseidon", "3522144043"],
  ]],
  ["Officially featured · earlier graduates", [
    ["Thera", "3121217565"], ["Memento", "3165559377"], ["Palacio", "3249860053"],
    ["Golden", "3286163323"], ["Warden", "3256988376"], ["Alpine", "3221491619"],
    ["Job", "3528751123"], ["Rooftop", "3536622725"],
  ]],
  ["Original community 5v5", [
    ["Basalt", "3329258290"], ["Splinter", "3691046714"], ["Iris", "3116932017"],
    ["Mills", "3152430710"], ["Foroglio", "3132854332"], ["Contact", "3467065969"],
    ["Transit", "3542662073"], ["Grail", "3246527710"],
  ]],
  ["Small / Wingman", [
    ["Outback", "3681511672"], ["Brewery", "3070290240"], ["Palais", "3257582863"],
    ["Drawbridge", "3070192462"], ["Drawbridge (Night)", "3555239820"], ["Manor", "3354923062"],
    ["Heizwerk", "3727434551"], ["Splat", "3439120481"], ["Assembly", "3071005299"],
    ["Hive", "3336683348"], ["Expo", "3657551121"],
  ]],
].map(([name, entries]) => ({
  name: name as string,
  maps: (entries as string[][]).map(([displayName, workshopId]) => ({
    name: workshopId, displayName, workshopId, category: "Workshop",
  })),
}));

// Pool Day appears in two groups with the same ID; show it once in All groups.
export const WORKSHOP_MAPS = [...new Map(WORKSHOP_GROUPS.flatMap((group) => group.maps).map((map) => [map.workshopId, map])).values()];
