;(function(window) {
  const saveObj = (key, obj) => {
    window.localStorage.setItem(key, JSON.stringify(obj));
  }

  const loadObj = (key) => {
    const val = window.localStorage.getItem(key);
    if (val) {
      return JSON.parse(val);
    }
    return {};
  }

  window.tvinit = ({ env }) => {
    saveObj('env', env);
  };

  const sleep = (t = 500) => new Promise((resolve) => { setTimeout(resolve, t); });

  const getConfig = () => ({
    dashboardpath: '/dashboard',
    ...window.___config,
    ...loadObj('env'),
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

    const emailInput = document.querySelector('form input[name="username"]');
    const passwordInput = document.querySelector('form input[name="password"]');
    const loginButton = document.querySelector('form button');

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

  const getLink = (hashParams) => {
    const isDefaultPort = () => {
      if (window.location.protocol === 'https:' && window.location) {}
    };

    return [
      `${window.location.protocol}//`,
      window.location.hostname,
      window.location.port !== '' ? `:${window.location.port}` : '',
      window.location.pathname,
      `#${hashParams.toString()}`,
    ].join('');
  };
  
  const isDashboardPage = () => {
    const config = getConfig();
    return window.location.pathname.startsWith(`${config.dashboardpath}/`);
  };

  const setHashSettings = async () => {
    const config = getConfig();

    if (!isDashboardPage()) {
      return;
    }

    const expected = {
      refresh: String(config.refresh),
      theme: config.theme === 'night' ? 'night' : null,
      fullscreen: config.fullscreen ? '' : null,
    };

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
      new window.URLSearchParams(),
    );


    window.history.replaceState('', '', getLink(newParams));
  };

  setHashSettings();

  const checkSettings = async () => {
    if (!isDashboardPage()) {
      return;
    }

    const config = getConfig();

    if (config.theme) {}
    const nightThemeCorrect = config.theme === 'night' && document.querySelector('.Dashboard--night') !== null;
    const dayThemeCorrect = config.theme !== 'night' && document.querySelector('.Dashboard--night') === null;
    const fullscreenCorrect = config.fullscreen && document.querySelector('.Dashboard--fullscreen') !== null;
    const normalScreenCorrect = !config.fullscreen && document.querySelector('.Dashboard--fullscreen') === null;

    const hashParams = new window.URLSearchParams(window.location.hash.replace(/^#/, ''));

    const refreshCorrect = hashParams.get('refresh') === String(config.refresh);
    const themeCorrect = nightThemeCorrect || dayThemeCorrect;
    const screenCorrect = fullscreenCorrect || normalScreenCorrect;

    if (!themeCorrect || !screenCorrect || !refreshCorrect) {
      setHashSettings();
      sleep(500);
      window.location.reload();
    }

    setTimeout(() => { checkSettings(); }, 2000);
  };

  window.addEventListener('load', async (event) => {
    await sleep(1000);
    checkSettings();
  });
})(window);


