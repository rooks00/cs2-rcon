// Exercise Next's actual adapter build path, which VERCEL=1 alone does not enable.
const adapter = {
  name: "relay-adapter-ci",
  async onBuildComplete({ config, outputs }) {
    if (config.output === "standalone") throw new Error("Adapter builds must not request standalone output.");
    if (!outputs.appRoutes.some((route) => route.pathname === "/api/rcon")) throw new Error("The hosted RCON route is missing from adapter output.");
    console.log("Verified adapter output includes the hosted RCON route.");
  },
};

export default adapter;
