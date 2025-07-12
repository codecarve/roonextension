const promisify = (fn, ctx) => (options) =>
  new Promise((resolve, reject) => {
    fn.call(ctx, options, (err, data) => (err ? reject(err) : resolve(data)));
  });

const browseAsync = (browse, options) =>
  promisify(browse.browse, browse)(options);

const loadAsync = (browse, options) => promisify(browse.load, browse)(options);

const browseAndLoadAllHierarchy = async (browse, hierarchy) => {
  // check if the hierarchy exists
  if (
    !["artists", "internet_radio", "playlists", "genres", "composers"].includes(
      hierarchy,
    )
  ) {
    throw new Error(`Invalid hierarchy: ${hierarchy}`);
  }
  const { list } = await browseAsync(browse, { hierarchy, pop_all: true });
  return loadAsync(browse, { hierarchy, count: list.count });
};

const browseAndLoadItem = async (browse, hierarchy, item_key) => {
  const { list } = await browseAsync(browse, { hierarchy, item_key });
  return loadAsync(browse, { hierarchy, count: list.count });
};

const browseAndLoadItemLevel = async (browse, hierarchy, item_key, level) => {
  const { list } = await browseAsync(browse, { hierarchy, item_key });
  return loadAsync(browse, { hierarchy, level, count: list.count });
};

const browseZoneOrOutput = async (
  browse,
  hierarchy,
  zone_or_output_id,
  item_key,
) => {
  await browseAsync(browse, { hierarchy, zone_or_output_id, item_key });
};

module.exports = {
  browseAsync,
  loadAsync,
  browseAndLoadAllHierarchy,
  browseAndLoadItem,
  browseAndLoadItemLevel,
  browseZoneOrOutput,
};
