export default jest.fn((_concurrency: number) => {
  return (fn: () => Promise<any>) => fn();
});
