module.exports = async function () {
  globalThis.__API_PROCESS__?.kill();
};
