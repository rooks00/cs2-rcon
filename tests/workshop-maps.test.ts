import { describe, expect, it } from "vitest";
import { WORKSHOP_GROUPS, WORKSHOP_MAPS } from "../lib/workshop-maps";
import { getMapChangeCommand } from "../lib/commands";

describe("supplied Workshop catalog", () => {
  it("keeps all 60 supplied entries in seven groups, with 59 unique IDs", () => {
    expect(WORKSHOP_GROUPS).toHaveLength(7);
    expect(WORKSHOP_GROUPS.flatMap((group) => group.maps)).toHaveLength(60);
    expect(WORKSHOP_MAPS).toHaveLength(59);
    for (const map of WORKSHOP_MAPS) {
      expect(getMapChangeCommand(map)).toBe(`host_workshop_map ${map.workshopId}`);
    }
  });

  it("keeps older and newer versions of Lake distinct", () => {
    expect(WORKSHOP_MAPS.filter((map) => map.displayName === "Lake").map((map) => map.workshopId)).toEqual(["3070563536", "3219506727"]);
  });
});
