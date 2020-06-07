;(function(window) {
  window.tvinit = ({ env }) => {
    window.___tvenv = env;
  };

  const sleep = (t = 500) => new Promise((resolve) => { setTimeout(resolve, t); });

  const getConfig = () => ({
    dashboardpath: '/dashboard',
    ...window.___config,
    ...(window.___tvenv || {})
  });

  const setInputValue = (inputElement, value) => {
    const ev = new Event('input', { bubbles: true });
    ev.simulated = true;
    inputElement.focus();
    inputElement.value = value;
    inputElement.defaultValue = value;
    inputElement.dispatchEvent(ev);
  };

  const autoLogin = async () => {
    const {
      email,
      password,
    } = getConfig();

    const emailInput = document.querySelector('.Login-content input[name="username"]');
    const passwordInput = document.querySelector('.Login-content input[name="password"]');
    const loginButton = document.querySelector('.Login-content button');

    if (emailInput && passwordInput && loginButton) {

      setInputValue(emailInput, email);
      await sleep();
      setInputValue(passwordInput, password);
      await sleep();
      loginButton.focus();
      loginButton.click();

      return true;
    }

    return false;
  };

  const navigate = (hashParams) => {
    const searchParams = new window.URLSearchParams(window.location.search.replace('?', ''));
    searchParams.set('_r', Math.ceil(Math.random() * 1000));

    const isDefaultPort = () => {
      if (window.location.protocol === 'https:' && window.location) {}
    };

    const newURL = [
      `${window.location.protocol}//`,
      window.location.hostname,
      window.location.port !== '' ? `:${window.location.port}` : '',
      window.location.pathname,
      `?${searchParams.toString()}`,
      `#${hashParams.toString()}`,
    ].join('');

    window.location.href = newURL;
  };

  const autoSettings = async () => {
    const config = getConfig();

    if (!window.location.pathname.startsWith(`${config.dashboardpath}/`)) {
      return;
    }

    const expected = {
      refresh: String(config.refresh),
      theme: config.theme === 'night' ? 'night' : null,
      fullscreen: config.fullscreen ? '' : null,
    };

    const oldParams = new window.URLSearchParams(window.location.hash.replace(/^#/, ''));

    const newParams = Object.entries(expected).reduce(
      (params, [key, value]) => {
        if (params.get(key) !== value) {
          if (value === null) {
            params.delete();
          } else {
            params.set(key, value);
          }
        }
        return params;
      },
      new window.URLSearchParams(oldParams.toString()),
    );

    const changed = Object.keys(expected).reduce((changed, key) => (
      changed || oldParams.get(key) !== newParams.get(key)
    ), false);

    if (changed) {
      navigate(newParams)
    }

    return changed;
  };

  window.addEventListener('load', async (event) => {
    await sleep(1000);
    await autoLogin();
    await sleep(1000);
    autoSettings();
  });
})(window);


