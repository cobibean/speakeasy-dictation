let activeOperations = 0;
export const isUpdateOperationActive = (): boolean => activeOperations > 0;
export const withUpdateActivity = async <T>(operation: () => Promise<T>): Promise<T> => {
  activeOperations++;
  try { return await operation(); }
  finally { activeOperations--; }
};
