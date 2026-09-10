export async function migrateLocalHistoryToAccount(remoteHistoryStore, sourceStore) {
  const localEntries = await sourceStore.list()

  if (localEntries.length === 0) {
    return
  }

  for (const entry of localEntries) {
    await remoteHistoryStore.save(entry)
  }

  await sourceStore.clear()
}
