/**
 * dashboard-actions.js
 * Handles the "Быстрая операция" button:
 *   - Dropdown toggle (type selection)
 *   - Modal open / close
 *   - Wallet field switching for TRANSFER
 *   - Category filtering by operation type
 */
(function () {
  'use strict';

  var TITLES = { INCOME: 'Доход', EXPENSE: 'Расход', TRANSFER: 'Перемещение' };

  // ── DOM refs (populated after DOMContentLoaded) ──
  var wrapper, btn, menu, backdrop, dialog,
      qopType, qopTitle, qopAmount, qopDesc,
      walletRow, fromRow, toRow,
      qopWallet, qopFrom, qopTo,
      qopCategoryRow, qopCategory, qopOccurredAt,
      qopClose, qopCancelBtn,
      qopFromGoalRow, qopToGoalRow, qopFromGoal, qopToGoal;

  // All category options stored at init for rebuilding
  var allCategoryOptions = [];

  function init() {
    wrapper     = document.getElementById('quickOpWrapper');
    btn         = wrapper && wrapper.querySelector('.quick-op-btn');
    menu        = wrapper && wrapper.querySelector('.quick-op-menu');
    backdrop    = document.getElementById('qopBackdrop');
    dialog      = backdrop && backdrop.querySelector('.qop-dialog');
    qopType     = document.getElementById('qopType');
    qopTitle    = document.getElementById('qopTitle');
    qopAmount   = document.getElementById('qopAmount');
    qopDesc     = document.getElementById('qopDesc');
    walletRow   = document.getElementById('qopWalletRow');
    fromRow     = document.getElementById('qopFromRow');
    toRow       = document.getElementById('qopToRow');
    qopWallet   = document.getElementById('qopWallet');
    qopFrom     = document.getElementById('qopFrom');
    qopTo       = document.getElementById('qopTo');
    qopCategoryRow = document.getElementById('qopCategoryRow');
    qopCategory    = document.getElementById('qopCategory');
    qopOccurredAt  = document.getElementById('qopOccurredAt');
    qopClose    = document.getElementById('qopClose');
    qopCancelBtn = document.getElementById('qopCancelBtn');
    qopFromGoalRow = document.getElementById('qopFromGoalRow');
    qopToGoalRow   = document.getElementById('qopToGoalRow');
    qopFromGoal    = document.getElementById('qopFromGoal');
    qopToGoal      = document.getElementById('qopToGoal');

    if (!wrapper || !backdrop) return;

    // Store all category options for later filtering (display:none on <option> is unreliable)
    if (qopCategory) {
      qopCategory.querySelectorAll('option[data-type]').forEach(function (opt) {
        allCategoryOptions.push({ value: opt.value, label: opt.textContent, type: opt.dataset.type, freq: !!opt.dataset.freq });
      });
    }

    // Dropdown toggle
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = !menu.hidden;
      menu.hidden = isOpen;
      btn.setAttribute('aria-expanded', String(!isOpen));
    });

    // Dropdown item clicks → open modal with correct type
    menu.querySelectorAll('a[data-type]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(this.dataset.type);
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    // Modal close
    qopClose.addEventListener('click', closeModal);
    qopCancelBtn.addEventListener('click', closeModal);

    // Close on backdrop click (outside dialog)
    backdrop.addEventListener('click', function (e) {
      if (!dialog.contains(e.target)) closeModal();
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!backdrop.classList.contains('qop-open')) {
          menu.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
        } else {
          closeModal();
        }
      }
    });
  }

  function filterCategories(type) {
    if (!qopCategory) return;
    var isTransfer = type === 'TRANSFER';

    // Hide category row for transfers
    if (qopCategoryRow) {
      qopCategoryRow.style.display = isTransfer ? 'none' : '';
    }
    if (isTransfer) {
      qopCategory.value = '';
      return;
    }

    // Rebuild options: keep "Без категории" placeholder, add only matching type
    // (display:none on <option> does not work on mobile browsers)
    while (qopCategory.options.length > 1) {
      qopCategory.removeChild(qopCategory.options[1]);
    }
    var freqItems = [];
    var regularItems = [];
    allCategoryOptions.forEach(function (cat) {
      if (cat.type === type) {
        if (cat.freq) freqItems.push(cat);
        else regularItems.push(cat);
      }
    });
    freqItems.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.value;
      opt.textContent = cat.label;
      qopCategory.appendChild(opt);
    });
    if (freqItems.length > 0 && regularItems.length > 0) {
      var sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '──────────';
      qopCategory.appendChild(sep);
    }
    regularItems.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.value;
      opt.textContent = cat.label;
      qopCategory.appendChild(opt);
    });
    qopCategory.value = '';
  }

  function openModal(type) {
    // Close dropdown first
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');

    // Set type
    qopType.value = type;
    qopTitle.textContent = TITLES[type] || 'Быстрая операция';

    // Show/hide wallet rows
    var isTransfer = type === 'TRANSFER';
    walletRow.style.display  = isTransfer ? 'none' : '';
    fromRow.style.display    = isTransfer ? '' : 'none';
    toRow.style.display      = isTransfer ? '' : 'none';
    qopWallet.disabled       = isTransfer;
    qopFrom.disabled         = !isTransfer;
    qopTo.disabled           = !isTransfer;

    // Filter categories by type
    filterCategories(type);

    // Filter SAVINGS wallets from EXPENSE
    if (typeof filterQopWalletsByType === 'function') filterQopWalletsByType(type);

    // Reset fields
    qopAmount.value = '';
    qopDesc.value   = '';
    if (qopCategory) qopCategory.value = '';
    if (qopOccurredAt) qopOccurredAt.value = '';
    if (qopFromGoal) qopFromGoal.value = '';
    if (qopToGoal) qopToGoal.value = '';

    // Show/hide goal fields for TRANSFER
    if (isTransfer) {
      if (typeof updateQopGoalFields === 'function') updateQopGoalFields();
    } else {
      if (qopFromGoalRow) qopFromGoalRow.style.display = 'none';
      if (qopToGoalRow) qopToGoalRow.style.display = 'none';
    }

    // Show wallet balance hints
    if (isTransfer) {
      if (typeof updateQopFromHint === 'function') updateQopFromHint();
      if (typeof updateQopToHint === 'function') updateQopToHint();
    } else {
      if (typeof updateQopWalletHint === 'function') updateQopWalletHint();
    }

    backdrop.classList.add('qop-open');
    qopAmount.focus();
  }

  function closeModal() {
    backdrop.classList.remove('qop-open');
    btn.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
