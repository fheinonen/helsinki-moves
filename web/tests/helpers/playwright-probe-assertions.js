async function assertProbeAware({ probe = false, waitFor = null, read, verify }) {
  if (!probe && typeof waitFor === "function") {
    await waitFor();
  }
  return verify(await read());
}

module.exports = {
  assertProbeAware,
};
