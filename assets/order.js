/* SoftRain — отправка заявок и понятные сообщения об ошибках.
   Используется формой на главной и формой предзаказа iPhone.
   Заявки принимает Cloudflare Worker; токен бота хранится в его секретах. */
(function () {
  var ENDPOINT = 'https://softrain-orders.vm-065.workers.dev';

  var TEXT = {
    ru: {
      nameEmpty: 'Укажите имя.',
      nameBad: 'Имя должно содержать буквы — например, «Алия».',
      phoneEmpty: 'Укажите телефон.',
      phoneBad: 'Неверный формат телефона. Нужен казахстанский номер: +7 7XX XXX XX XX.',
      offline: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      timeout: 'Сервер не ответил за 15 секунд. Попробуйте ещё раз.',
      http400: 'Сервер не принял данные — проверьте имя и телефон.',
      http403: 'Сервер отклонил запрос с этого адреса.',
      http413: 'Слишком длинный комментарий — сократите его.',
      http429: 'Слишком много заявок подряд. Подождите минуту и отправьте снова.',
      http5xx: 'Сервер заявок временно не работает.',
      httpOther: 'Сервер ответил ошибкой',
      rejected: 'Сервер не принял заявку.',
      reason: 'Причина',
      fallback: 'Напишите нам в WhatsApp или Telegram.'
    },
    en: {
      nameEmpty: 'Please enter your name.',
      nameBad: 'Name must contain letters.',
      phoneEmpty: 'Please enter your phone number.',
      phoneBad: 'Invalid phone format. We need a Kazakhstan number: +7 7XX XXX XX XX.',
      offline: 'No connection to the server. Check your internet and try again.',
      timeout: 'The server did not respond within 15 seconds. Please try again.',
      http400: 'The server did not accept the data — check your name and phone.',
      http403: 'The server rejected requests from this address.',
      http413: 'The comment is too long — please shorten it.',
      http429: 'Too many requests. Wait a minute and try again.',
      http5xx: 'The order server is temporarily unavailable.',
      httpOther: 'The server returned an error',
      rejected: 'The server did not accept the request.',
      reason: 'Reason',
      fallback: 'Message us on WhatsApp or Telegram.'
    }
  };

  function t(key) {
    var lang = document.documentElement.lang === 'en' ? 'en' : 'ru';
    return TEXT[lang][key];
  }

  // Приводит номер к виду +77XXXXXXXXX. Принимает 8 707…, +7 (707)…, 707…; иначе null.
  function normalizePhone(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '8' || d[0] === '7')) d = d.slice(1);
    if (d.length !== 10 || d[0] !== '7') return null;
    return '+7' + d;
  }

  // Проверка перед отправкой. Возвращает { field, message } или null.
  function validate(name, phone) {
    if (!name) return { field: 'name', message: t('nameEmpty') };
    if (!/\p{L}/u.test(name)) return { field: 'name', message: t('nameBad') };
    if (!phone) return { field: 'phone', message: t('phoneEmpty') };
    if (!normalizePhone(phone)) return { field: 'phone', message: t('phoneBad') };
    return null;
  }

  // Достаёт текст причины из ответа Worker: {error}, {message}, {description} или короткий текст.
  function reasonFrom(body) {
    if (!body) return '';
    if (typeof body === 'object') {
      var r = body.error || body.message || body.description || body.reason || '';
      if (r && typeof r === 'object') r = r.message || r.description || JSON.stringify(r);
      return String(r).slice(0, 200);
    }
    var s = String(body).trim();
    return s.length && s.length <= 200 && s.indexOf('<') === -1 ? s : '';
  }

  function httpMessage(status) {
    if (status === 400 || status === 422) return t('http400');
    if (status === 403) return t('http403');
    if (status === 413) return t('http413');
    if (status === 429) return t('http429');
    if (status >= 500) return t('http5xx');
    return t('httpOther') + ' (' + status + ').';
  }

  // Отправляет заявку. Успех — промис разрешается; ошибка — Error с понятным message.
  function send(data) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: ctrl ? ctrl.signal : undefined
    })
      .catch(function (e) {
        throw new Error(e && e.name === 'AbortError' ? t('timeout') : t('offline'));
      })
      .then(function (r) {
        return r.text().then(function (txt) {
          var body = txt;
          try { body = JSON.parse(txt); } catch (e) {}
          var reason = reasonFrom(body);
          if (!r.ok) {
            throw new Error(httpMessage(r.status) + (reason ? ' ' + t('reason') + ': ' + reason + '.' : ''));
          }
          if (body && typeof body === 'object' && body.ok === false) {
            throw new Error(t('rejected') + (reason ? ' ' + t('reason') + ': ' + reason + '.' : ''));
          }
          return body;
        });
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  // Подсветка поля с ошибкой
  function markInvalid(input, bad) {
    if (!input) return;
    if (bad) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    else input.removeAttribute('aria-invalid');
  }

  window.SoftRainOrder = {
    endpoint: ENDPOINT,
    normalizePhone: normalizePhone,
    validate: validate,
    send: send,
    markInvalid: markInvalid,
    fallback: function () { return t('fallback'); }
  };
})();
