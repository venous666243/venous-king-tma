/**
 * Venous King — Telegram Mini App (коммерческая версия для портфолио)
 * Vanilla JS + Tailwind CDN + симуляция оплаты картой
 */

// —————————————————————————————————————————————————————————————
// Состояние приложения
// —————————————————————————————————————————————————————————————

let activeCategory = 'burgers';
const cart = {};
let selectedPaySystem = 'visa';
let currentOrderId = null;
let pendingOrderPayload = null;

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80';

const PAYMENT_PROCESSING_MS = 2000;

const tg = window.Telegram?.WebApp ?? null;

// —————————————————————————————————————————————————————————————
// Telegram WebApp
// —————————————————————————————————————————————————————————————

function initTelegram() {
  if (!tg) {
    console.warn('[Venous King] Telegram WebApp SDK недоступен — режим предпросмотра.');
    return;
  }

  tg.ready();
  tg.expand();

  if (typeof tg.setHeaderColor === 'function') {
    tg.setHeaderColor('#0f0406');
  }
  if (typeof tg.setBackgroundColor === 'function') {
    tg.setBackgroundColor('#0f0406');
  }

  const firstName = tg.initDataUnsafe?.user?.first_name;
  const greetingEl = document.getElementById('user-greeting');

  if (firstName) {
    greetingEl.textContent = `Привет, ${firstName}!`;
  } else {
    greetingEl.textContent = 'Добро пожаловать';
  }
}

// —————————————————————————————————————————————————————————————
// Утилиты
// —————————————————————————————————————————————————————————————

function formatPrice(amount) {
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getProductImageUrl(product) {
  const url = product.image || product.img || '';
  return typeof url === 'string' ? url.trim() : '';
}

function getProduct(id) {
  return PRODUCTS.find((product) => product.id === id);
}

function getCartCount() {
  return Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
}

function getCartTotal() {
  return Object.entries(cart).reduce((total, [productId, quantity]) => {
    const product = getProduct(Number(productId));
    if (!product) {
      return total;
    }
    return total + product.price * quantity;
  }, 0);
}

function getCartItems() {
  return Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([productId, quantity]) => {
      const product = getProduct(Number(productId));
      return {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity,
        subtotal: product.price * quantity,
      };
    });
}

function generateOrderId() {
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `VK-${randomPart}`;
}

function buildOrderPayload(orderId) {
  const items = getCartItems();
  const total = getCartTotal();

  return {
    brand: BRAND.name,
    orderId,
    items,
    total,
    currency: 'RUB',
    paymentSystem: selectedPaySystem,
    paymentStatus: 'simulated_paid',
    createdAt: new Date().toISOString(),
    user: tg?.initDataUnsafe?.user ?? null,
  };
}

function clearCart() {
  Object.keys(cart).forEach((key) => {
    delete cart[key];
  });
}

// —————————————————————————————————————————————————————————————
// Рендер меню
// —————————————————————————————————————————————————————————————

function renderCategories() {
  const nav = document.getElementById('categories');

  nav.innerHTML = CATEGORIES.map((category) => {
    const isActive = activeCategory === category.id;

    return `
      <button
        type="button"
        data-category="${category.id}"
        class="category-btn shrink-0 rounded-2xl px-4 py-2.5 text-sm font-semibold transition duration-200 active:scale-95
          ${isActive
            ? 'bg-[#d4af37] text-[#0f0406] shadow-lg shadow-[#d4af37]/25'
            : 'border border-[#2d1217] bg-[#1a090d] text-[#c9b4b8] hover:border-[#d4af37]/30'}"
      >
        ${category.emoji} ${category.label}
      </button>
    `;
  }).join('');

  nav.querySelectorAll('.category-btn').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      renderCategories();
      renderProducts();
    });
  });
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  const items = PRODUCTS.filter((product) => product.category === activeCategory);

  grid.innerHTML = items
    .map((product) => {
      const quantity = cart[product.id] || 0;
      const imageUrl = getProductImageUrl(product) || FALLBACK_IMAGE;

      return `
        <article class="product-card overflow-hidden rounded-2xl border border-[#2d1217] bg-[#1a090d] shadow-lg shadow-black/30">
          <div class="relative aspect-[4/3] overflow-hidden bg-[#0f0406]">
            <img
              src="${imageUrl}"
              alt="${escapeHtml(product.name)}"
              class="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              data-fallback="${FALLBACK_IMAGE}"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-[#0f0406] via-transparent to-transparent"></div>
          </div>
          <div class="p-3">
            <h3 class="line-clamp-1 text-sm font-bold text-[#f5f0f1]">${escapeHtml(product.name)}</h3>
            <p class="mt-0.5 line-clamp-2 text-xs text-[#a08a8f]">${escapeHtml(product.description)}</p>
            <p class="mt-2 font-bold text-[#d4af37]">${formatPrice(product.price)}</p>

            ${
              quantity === 0
                ? `<button
                    type="button"
                    data-action="add"
                    data-id="${product.id}"
                    class="mt-2 w-full rounded-xl border border-[#2d1217] bg-[#0f0406] py-2 text-sm font-semibold text-[#d4af37] transition hover:border-[#d4af37]/50 active:scale-95"
                  >В корзину</button>`
                : `<div class="mt-2 flex items-center justify-between rounded-xl border border-[#2d1217] bg-[#0f0406] p-1">
                    <button
                      type="button"
                      data-action="minus"
                      data-id="${product.id}"
                      class="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2d1217] text-lg font-bold text-[#f5f0f1] transition hover:border-[#d4af37]/40 active:scale-95"
                    >−</button>
                    <span class="min-w-[2rem] text-center font-bold text-[#d4af37]">${quantity}</span>
                    <button
                      type="button"
                      data-action="plus"
                      data-id="${product.id}"
                      class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#d4af37] text-lg font-bold text-[#0f0406] transition hover:bg-[#b8962e] active:scale-95"
                    >+</button>
                  </div>`
            }
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('img[data-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      const fallback = img.getAttribute('data-fallback');
      if (fallback && img.src !== fallback) {
        img.src = fallback;
      }
    });
  });

  grid.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const productId = Number(button.dataset.id);
      const action = button.dataset.action;

      if (action === 'add' || action === 'plus') {
        changeQty(productId, 1);
      }
      if (action === 'minus') {
        changeQty(productId, -1);
      }
    });
  });
}

function changeQty(productId, delta) {
  const current = cart[productId] || 0;
  const next = current + delta;

  if (next <= 0) {
    delete cart[productId];
  } else {
    cart[productId] = next;
  }

  updateCartUI();
  renderProducts();
}

function updateCartUI() {
  const count = getCartCount();
  const button = document.getElementById('view-order-btn');
  const badge = document.getElementById('cart-badge');

  button.disabled = count === 0;

  if (count > 0) {
    badge.textContent = String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// —————————————————————————————————————————————————————————————
// Модальное окно оплаты
// —————————————————————————————————————————————————————————————

function renderPaymentOrderSummary() {
  const list = document.getElementById('payment-order-list');
  const totalEl = document.getElementById('payment-order-total');
  const payLabel = document.getElementById('pay-submit-label');
  const items = getCartItems();
  const total = getCartTotal();

  if (items.length === 0) {
    list.innerHTML = '<li class="text-[#a08a8f]">Корзина пуста</li>';
    totalEl.textContent = '0 ₽';
    payLabel.textContent = 'Оплатить 0 ₽';
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
        <li class="flex justify-between gap-2 rounded-xl border border-[#2d1217] bg-[#1a090d] px-3 py-2">
          <span>${escapeHtml(item.name)} × ${item.quantity}</span>
          <span class="font-semibold text-[#d4af37]">${formatPrice(item.subtotal)}</span>
        </li>
      `
    )
    .join('');

  totalEl.textContent = formatPrice(total);
  payLabel.textContent = `Оплатить ${formatPrice(total)}`;
}

function showPaymentStep(stepName) {
  const formStep = document.getElementById('payment-step-form');
  const processingStep = document.getElementById('payment-step-processing');
  const successStep = document.getElementById('payment-step-success');
  const footer = document.getElementById('payment-footer');

  formStep.classList.add('hidden');
  processingStep.classList.add('hidden');
  processingStep.classList.remove('flex');
  successStep.classList.add('hidden');
  successStep.classList.remove('flex');

  if (stepName === 'form') {
    formStep.classList.remove('hidden');
    footer.classList.remove('hidden');
  }

  if (stepName === 'processing') {
    processingStep.classList.remove('hidden');
    processingStep.classList.add('flex');
    footer.classList.add('hidden');
  }

  if (stepName === 'success') {
    successStep.classList.remove('hidden');
    successStep.classList.add('flex');
    footer.classList.add('hidden');
  }
}

function resetPaymentForm() {
  document.getElementById('card-number').value = '';
  document.getElementById('card-expiry').value = '';
  document.getElementById('card-cvv').value = '';
  showPaymentStep('form');
}

function openPaymentModal() {
  const items = getCartItems();
  if (items.length === 0) {
    if (tg && typeof tg.showAlert === 'function') {
      tg.showAlert('Добавьте блюда в корзину перед оформлением.');
    } else {
      alert('Добавьте блюда в корзину перед оформлением.');
    }
    return;
  }

  currentOrderId = generateOrderId();
  pendingOrderPayload = null;
  resetPaymentForm();
  renderPaymentOrderSummary();

  const modal = document.getElementById('payment-modal');
  const panel = document.getElementById('payment-panel');

  modal.classList.remove('hidden');
  modal.classList.add('flex', 'modal-overlay-open');
  modal.setAttribute('aria-hidden', 'false');

  panel.classList.remove('modal-panel-open');
  void panel.offsetWidth;
  panel.classList.add('modal-panel-open');

  document.getElementById('success-order-id').textContent =
    `Заказ ${currentOrderId} успешно оплачен!`;
}

function closePaymentModal() {
  const modal = document.getElementById('payment-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex', 'modal-overlay-open');
  modal.setAttribute('aria-hidden', 'true');
  showPaymentStep('form');
}

// —————————————————————————————————————————————————————————————
// Форматирование полей карты
// —————————————————————————————————————————————————————————————

function formatCardNumberInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(' ') : '';
}

function formatExpiryInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatCvvInput(value) {
  return value.replace(/\D/g, '').slice(0, 3);
}

function initCardInputs() {
  const cardNumberInput = document.getElementById('card-number');
  const expiryInput = document.getElementById('card-expiry');
  const cvvInput = document.getElementById('card-cvv');

  cardNumberInput.addEventListener('input', (event) => {
    const formatted = formatCardNumberInput(event.target.value);
    event.target.value = formatted;
  });

  expiryInput.addEventListener('input', (event) => {
    const formatted = formatExpiryInput(event.target.value);
    event.target.value = formatted;
  });

  cvvInput.addEventListener('input', (event) => {
    const formatted = formatCvvInput(event.target.value);
    event.target.value = formatted;
  });
}

function initPaySystemButtons() {
  const buttons = document.querySelectorAll('.pay-system-btn');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedPaySystem = button.dataset.system;

      buttons.forEach((item) => {
        item.classList.remove('is-active');
      });

      button.classList.add('is-active');
    });
  });
}

function validatePaymentForm() {
  const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
  const expiry = document.getElementById('card-expiry').value;
  const cvv = document.getElementById('card-cvv').value;

  if (cardNumber.length !== 16) {
    return 'Введите номер карты из 16 цифр (демо: любые цифры).';
  }

  if (!/^\d{2}\/\d{2}$/.test(expiry)) {
    return 'Укажите срок действия в формате ММ/ГГ.';
  }

  if (cvv.length !== 3) {
    return 'Введите CVV из 3 цифр.';
  }

  return null;
}

function showValidationError(message) {
  if (tg && typeof tg.showAlert === 'function') {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

// —————————————————————————————————————————————————————————————
// Симуляция оплаты и отправка в Telegram
// —————————————————————————————————————————————————————————————

function sendOrderToTelegram(orderPayload) {
  const payload = JSON.stringify(orderPayload);

  if (tg && typeof tg.sendData === 'function') {
    tg.sendData(payload);
    return true;
  }

  console.log('[Venous King] Демо-отправка заказа:', orderPayload);
  return false;
}

function handlePaySubmit() {
  const validationError = validatePaymentForm();

  if (validationError) {
    showValidationError(validationError);
    return;
  }

  const orderId = currentOrderId || generateOrderId();
  currentOrderId = orderId;

  pendingOrderPayload = buildOrderPayload(orderId);

  showPaymentStep('processing');

  window.setTimeout(() => {
    sendOrderToTelegram(pendingOrderPayload);

    document.getElementById('success-order-id').textContent =
      `Заказ ${orderId} успешно оплачен!`;

    showPaymentStep('success');
  }, PAYMENT_PROCESSING_MS);
}

function handleBackToMenu() {
  clearCart();
  currentOrderId = null;
  pendingOrderPayload = null;

  closePaymentModal();
  updateCartUI();
  renderProducts();
}

// —————————————————————————————————————————————————————————————
// Инициализация событий
// —————————————————————————————————————————————————————————————

function initEventListeners() {
  document.getElementById('view-order-btn').addEventListener('click', openPaymentModal);

  document.getElementById('close-payment-modal').addEventListener('click', closePaymentModal);

  document.getElementById('payment-modal').addEventListener('click', (event) => {
    if (event.target.id === 'payment-modal') {
      closePaymentModal();
    }
  });

  document.getElementById('pay-submit-btn').addEventListener('click', handlePaySubmit);

  document.getElementById('back-to-menu-btn').addEventListener('click', handleBackToMenu);
}

function initApp() {
  initTelegram();
  initCardInputs();
  initPaySystemButtons();
  initEventListeners();
  renderCategories();
  renderProducts();
  updateCartUI();
}

initApp();
