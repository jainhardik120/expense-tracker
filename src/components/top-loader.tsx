'use client';

import { type EffectCallback, useEffect } from 'react';

import { start, done, configure } from 'nprogress';

const NextTopLoader = ({ showForHashAnchor = true }: { showForHashAnchor?: boolean }) => {
  const styles = (
    <style>
      {`#nprogress{pointer-events:none}#nprogress .bar{background:hsl(var(--foreground));position:fixed;z-index:1600;top: 0;left:0;width:100%;height:3px}#nprogress .peg{display:block;position:absolute;right:0;width:100px;height:100%;opacity:1;-webkit-transform:rotate(3deg) translate(0px,-4px);-ms-transform:rotate(3deg) translate(0px,-4px);transform:rotate(3deg) translate(0px,-4px)}.nprogress-custom-parent{overflow:hidden;position:relative}.nprogress-custom-parent #nprogress .bar,`}
    </style>
  );

  const toAbsoluteURL = (url: string): string => {
    return new URL(url, window.location.href).href;
  };

  const isHashAnchor = (currentUrl: string, newUrl: string): boolean => {
    const current = new URL(toAbsoluteURL(currentUrl));
    const next = new URL(toAbsoluteURL(newUrl));
    return current.href.split('#')[0] === next.href.split('#')[0];
  };

  const isSameHostName = (currentUrl: string, newUrl: string): boolean => {
    const current = new URL(toAbsoluteURL(currentUrl));
    const next = new URL(toAbsoluteURL(newUrl));
    return current.hostname.replace(/^www\./, '') === next.hostname.replace(/^www\./, '');
  };

  useEffect((): ReturnType<EffectCallback> => {
    configure({
      showSpinner: false,
      trickle: true,
      trickleSpeed: 200,
      minimum: 0.08,
      easing: 'ease',
      speed: 200,
      template: '<div class="bar" role="bar"><div class="peg"></div></div>',
    });

    const isAnchorOfCurrentUrl = (currentUrl: string, newUrl: string): boolean => {
      const currentUrlObj = new URL(currentUrl);
      const newUrlObj = new URL(newUrl);
      if (
        currentUrlObj.hostname === newUrlObj.hostname &&
        currentUrlObj.pathname === newUrlObj.pathname &&
        currentUrlObj.search === newUrlObj.search
      ) {
        const currentHash = currentUrlObj.hash;
        const newHash = newUrlObj.hash;
        return (
          currentHash !== newHash &&
          currentUrlObj.href.replace(currentHash, '') === newUrlObj.href.replace(newHash, '')
        );
      }
      return false;
    };

    // eslint-disable-next-line no-var
    var nProgressClass: NodeListOf<HTMLHtmlElement> = document.querySelectorAll('html');

    const removeNProgressClass = (): void => {
      nProgressClass.forEach((el: Element) => {
        el.classList.remove('nprogress-busy');
      });
    };

    const findClosestAnchor = (element: HTMLElement | null): HTMLAnchorElement | null => {
      let foundElement = element;
      while (foundElement !== null && foundElement.tagName.toLowerCase() !== 'a') {
        foundElement = foundElement.parentElement;
      }
      return foundElement as HTMLAnchorElement;
    };

    const handleClick = (event: MouseEvent): void => {
      try {
        const target = event.target as HTMLElement;
        const anchor = findClosestAnchor(target);
        const newUrl = anchor?.href;
        if (newUrl !== undefined) {
          const currentUrl = window.location.href;
          const isExternalLink = (anchor as HTMLAnchorElement).target === '_blank';
          const isSpecialScheme = ['tel:', 'mailto:', 'sms:', 'blob:', 'download:'].some((scheme) =>
            newUrl.startsWith(scheme),
          );
          const notSameHost = !isSameHostName(window.location.href, anchor?.href ?? '');
          if (notSameHost) {
            return;
          }
          const isAnchorOrHashAnchor =
            isAnchorOfCurrentUrl(currentUrl, newUrl) ||
            isHashAnchor(window.location.href, anchor?.href ?? '');
          if (!showForHashAnchor && isAnchorOrHashAnchor) {
            return;
          }
          if (
            newUrl === currentUrl ||
            isExternalLink ||
            isSpecialScheme ||
            isAnchorOrHashAnchor ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey ||
            !toAbsoluteURL(anchor?.href ?? '').startsWith('http')
          ) {
            start();
            done();
            removeNProgressClass();
          } else {
            start();
          }
        }
      } catch {
        start();
        done();
      }
    };

    ((history: History): void => {
      const pushStateRef = history.pushState.bind(history);
      history.pushState = (...args) => {
        done();
        removeNProgressClass();
        pushStateRef(...args);
      };
    })((window as Window).history);

    ((history: History): void => {
      const replaceStateRef = history.replaceState.bind(history);
      history.replaceState = (...args) => {
        done();
        removeNProgressClass();
        replaceStateRef(...args);
      };
    })((window as Window).history);

    const handlePageHide = (): void => {
      done();
      removeNProgressClass();
    };

    const handleBackAndForth = (): void => {
      done();
    };

    window.addEventListener('popstate', handleBackAndForth);
    document.addEventListener('click', handleClick);
    window.addEventListener('pagehide', handlePageHide);

    return (): void => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('popstate', handleBackAndForth);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return styles;
};
export default NextTopLoader;
