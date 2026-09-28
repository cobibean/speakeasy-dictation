/** A broadcast from an immediate control must not replace a different local edit. */
export const reconcileSettingDraft = <T>(draft: T, previousSaved: T | undefined, nextSaved: T): T =>
  previousSaved !== undefined && draft !== previousSaved ? draft : nextSaved;
