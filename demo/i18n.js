// A tiny i18n layer with deliberate bugs, so fitlocale has something to find.
(async function () {
  const html = document.documentElement;
  // Planted bug: pages marked like this forget the saved locale and fall back to English.
  const lang = html.hasAttribute('data-ignore-saved-locale') ? 'en' : (localStorage.getItem('lang') || 'en');
  const messages = await (await fetch('locales/' + lang + '.json')).json();
  const lookup = key => key.split('.').reduce((node, part) => (node ? node[part] : undefined), messages);

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const value = lookup(el.dataset.i18n);
    // Like real libraries, a missing key falls back to showing the key itself (planted bug: #welcome).
    // Placeholders are never interpolated (planted bug: #inbox-count).
    el.textContent = typeof value === 'string' ? value : el.dataset.i18n;
  }

  for (const el of document.querySelectorAll('[data-i18n-html]')) {
    const value = lookup(el.dataset.i18nHtml);
    if (typeof value === 'string') el.innerHTML = value;
  }

  const price = document.getElementById('price');
  // Planted bug: the product price was never loaded.
  if (price) price.textContent = lookup('pricing.label') + ' ' + (window.product && window.product.price);

  html.lang = lang;
  if (['ar', 'he', 'fa', 'ur'].includes(lang.split('-')[0])) html.dir = 'rtl';
  else html.removeAttribute('dir');
  html.dataset.ready = '1';
})();
