import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || '';

export const api = {
  getDefaults: () => axios.get(`${BASE}/api/defaults`).then(r => r.data),
  simulate:    (params) => axios.post(`${BASE}/api/simulate`, params).then(r => r.data),
  monteCarlo:  (params, nRuns) =>
    axios.post(`${BASE}/api/simulate/monte-carlo`, { params, n_runs: nRuns }).then(r => r.data),
};
