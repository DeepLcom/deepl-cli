import nock from 'nock';

beforeAll(() => {
  if (!nock.isActive()) {
    nock.activate();
  }
  nock.disableNetConnect();
});

afterEach(() => {
  nock.abortPendingRequests();
  nock.cleanAll();
});

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  nock.restore();
});
