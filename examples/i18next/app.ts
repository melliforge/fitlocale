// A tiny page using i18next, with two planted bugs for the pseudo locale to find.
import { setupI18n } from './i18n';

const lang = new URL(location.href).searchParams.get('lang') ?? 'en';
const i18n = await setupI18n(lang);

const set = (id: string, text: string) => { document.getElementById(id)!.textContent = text; };
set('home', i18n.t('nav.home'));
set('orders', i18n.t('nav.orders'));
set('welcome', i18n.t('welcome', { name: 'Sam' }));
// Bug: a sentence glued together from two messages. Word order differs between languages.
set('cart', `${i18n.t('cart.saved')} ${i18n.t('cart.order')}`);
// Bug: #shipping keeps its hardcoded English (see index.html).
document.documentElement.dataset.ready = '1';
