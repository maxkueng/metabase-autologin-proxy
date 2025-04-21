import type { Config } from './config';

declare global {
  interface Window {
    __config: Config['metabase'];
  }
}

;(function(window) {
  const storeConfig = (obj: Partial<Config['metabase']>) => {
    window.localStorage.setItem('env', JSON.stringify(obj));
  }

  const loadStoredConfig = (): Partial<Config['metabase']> => {
    const val = window.localStorage.getItem('env');
    if (val) {
      return JSON.parse(val);
    }
    return {};
  }

  window.tvinit = ({ env }) => {
    storeConfig(env);
  };

  const sleep = (t = 500) => new Promise((resolve) => { setTimeout(resolve, t); });

  const getConfig = () => ({
    ...window.___config,
    ...loadStoredConfig(),
  });

  const getLink = (hashParams: string) => {
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
    return window.location.pathname.startsWith(`${config.dashboardPath}/`);
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


