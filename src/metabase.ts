const axios = require('axios');

type Credentials = {
  email: string;
  password: string;
};

export async function checkSessionId(host: string, sessionId: string | null) {
  try {
    await axios.request({
      method: 'GET',
      url: `${host}/api/user/current`,
      headers: {
        'X-Metabase-Session': sessionId,
      },
    });
    return true;
  } catch (err) {
    if ((err as any).response.status === 401) {
      return false;
    }
    throw err;
  }
};

export async function getSessionId(
  host: string,
  {
    email: username,
    password,
  }: Credentials,
) {
  const res = await axios.request({
    method: 'POST',
    url: `${host}/api/session`,
    data: {
      username,
      password,
    },
  });

  return res.data.id;
};