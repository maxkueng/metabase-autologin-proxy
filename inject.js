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

  const getLink = (hashParams) => {
    return [
      `${window.location.protocol}//`,
      window.location.hostname,
      window.location.port !== '' ? `:${window.location.port}` : '',
      window.location.pathname,
      `#${hashParams}`,
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

    const newParams = [
      `refresh=${String(config.refresh)}`,
    ];
    if (config.theme === 'night') {
      newParams.push(`theme=night`);
    }
    if (config.fullscreen) {
      newParams.push('fullscreen');
    }


    window.history.replaceState('', '', getLink(newParams.join('&')));
  };

  setHashSettings();

  const checkSettings = async () => {
    if (!isDashboardPage()) {
      return;
    }

    const config = getConfig();

    if (config.theme) {}
    const hashParams = new window.URLSearchParams(window.location.hash.replace(/^#/, ''));

    const isThemeCorrect = hashParams.get('theme') === config.theme;
    const isRefreshCorrect = hashParams.get('refresh') === String(config.refresh);
    const isFullscreenCorrect = config.fullscreen && hashParams.has('fullscreen');

    if (
      !isThemeCorrect
      || !isRefreshCorrect
      || !isFullscreenCorrect
    ) {
      setHashSettings();
      sleep(500);
    }

    setTimeout(() => { checkSettings(); }, 2000);
  };

  window.addEventListener('load', async (event) => {
    await sleep(1000);
    checkSettings();
  });
})(window);


