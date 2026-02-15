import nock from 'nock';

beforeAll(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.abortPendingRequests();
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
