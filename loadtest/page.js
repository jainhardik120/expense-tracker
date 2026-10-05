import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

const users = new SharedArray('users', () => JSON.parse(open(__ENV.USERS_FILE)));
const BASE = __ENV.BASE ?? 'http://localhost:3000';
const PATH = __ENV.PAGE_PATH ?? '/';

export const options = {
  scenarios: {
    page: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS ?? 10),
      duration: __ENV.DURATION ?? '45s',
      gracefulStop: '30s',
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const user = users[(exec.vu.idInTest - 1) % users.length];
  const res = http.get(`${BASE}${PATH}`, {
    headers: {
      Cookie: [
        `__Secure-better-auth.session_token=${user.cookie}`,
        `better-auth.session_token=${user.cookie}`,
        'timezone=Asia/Calcutta',
      ].join('; '),
    },
    redirects: 0,
    timeout: '60s',
    tags: { name: PATH },
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    'signed in as the right user': (r) => typeof r.body === 'string' && r.body.includes(user.email),
  });
  sleep(1 + Math.random() * 2);
}
