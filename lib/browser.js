const browseArtists = async (browse) => {
  return new Promise((resolve, reject) => {
    browse.browse({ hierarchy: "artists", pop_all: true }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   action: 'list',
      //   list: {
      //     level: 0,
      //     title: 'Artists',
      //     subtitle: null,
      //     image_key: null,
      //     count: 583,
      //     display_offset: null
      // }
      //}
      resolve(body);
    });
  });
};

const browseInternetRadios = async (browse) => {
  return new Promise((resolve, reject) => {
    browse.browse({ hierarchy: "internet_radio", pop_all: true }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   action: 'list',
      //   list: {
      //     level: 0,
      //     title: 'Artists',
      //     subtitle: null,
      //     image_key: null,
      //     count: 583,
      //     display_offset: null
      // }
      //}
      resolve(body);
    });
  });
};

const loadArtists = async (browse, count) => {
  return new Promise((resolve, reject) => {
    browse.load({ hierarchy: "artists", count: +count }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   items: [
      //     {
      //       title: '‘Papa’ John DeFrancesco',
      //       subtitle: '1 Album',
      //       image_key: '8105e6c949f3be39d01f434a15ddcdb2',
      //       item_key: '1:0',
      //       hint: 'list'
      //     },
      //
      resolve(body);
    });
  });
};

const loadInternetRadios = async (browse, count) => {
  return new Promise((resolve, reject) => {
    browse.load({ hierarchy: "internet_radio", count: +count }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   items: [
      //     {
      //       title: '‘Papa’ John DeFrancesco',
      //       subtitle: '1 Album',
      //       image_key: '8105e6c949f3be39d01f434a15ddcdb2',
      //       item_key: '1:0',
      //       hint: 'list'
      //     },
      //
      resolve(body);
    });
  });
};

const browseAndLoadAllArtists = async (browse) => {
  const browseResult = await browseArtists(browse);
  console.log("browseResult: ", browseResult);
  return await loadArtists(browse, browseResult.list.count);
};

const browseAndLoadAllInternetRadios = async (browse) => {
  const browseResult = await browseInternetRadios(browse);
  return await loadInternetRadios(browse, browseResult.list.count);

};

module.exports = {
  browseAndLoadAllArtists,
  browseAndLoadAllInternetRadios
};
