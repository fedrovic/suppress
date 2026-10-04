(function () {
  'use strict';

  const adminTokenStorage = 'xpAdminToken';
  const notice = document.getElementById('adminNotice');
  const page = document.body.dataset.page || 'dashboard';
  const API_BASE = window.XPLODE_API_BASE
    ? String(window.XPLODE_API_BASE).replace(/\/+$/, '')
    : ['localhost', '127.0.0.1', ''].includes(window.location.hostname)
      ? 'http://localhost:3000'
      : window.location.origin;

  const money = (value) => `UGX ${Number(value || 0).toLocaleString()}`;

  const setNodeMessage = (node, text, type = 'error') => {
    if (!node) return;
    node.textContent = text;
    node.classList.toggle('success', type === 'success');
    node.classList.toggle('error', type !== 'success');
  };

  const apiRequest = async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const adminToken = sessionStorage.getItem(adminTokenStorage);
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
      });
    } catch (error) {
      throw new Error('Cannot reach the XPLODE server. Open http://localhost:3000/admin.html');
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      sessionStorage.removeItem(adminTokenStorage);
      window.location.replace('index.html');
      throw new Error('Session expired. Sign in again.');
    }
    if (!response.ok) throw new Error(payload.message || 'Request failed');
    return payload;
  };

  // ---------- rendering helpers ----------
  const emptyItem = (text) => {
    const item = document.createElement('li');
    const wrap = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = text;
    wrap.appendChild(strong);
    item.appendChild(wrap);
    return item;
  };

  const errorItem = (message) => emptyItem(message);

  // Candy 3D confirmation dialog. Resolves true only when the operator taps
  // the confirm button; Escape, the overlay, or Cancel resolve false.
  let activeConfirmDialog = null;

  const confirmDialog = ({ title, body, confirmLabel = 'Confirm', danger = false }) => {
    // Never stack dialogs: a second request while one is open is treated as Cancel.
    if (activeConfirmDialog) return Promise.resolve(false);
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'reward-overlay admin-confirm-overlay';
      const modal = document.createElement('div');
      modal.className = 'reward-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const heading = document.createElement('h2');
      heading.className = 'reward-title';
      heading.textContent = title;
      const text = document.createElement('p');
      text.className = 'reward-note';
      text.textContent = body;
      const actions = document.createElement('div');
      actions.className = 'admin-confirm-actions';
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'history-retry';
      cancelButton.textContent = 'Cancel';
      const confirmButton = document.createElement('button');
      confirmButton.type = 'button';
      confirmButton.className = 'history-retry';
      if (danger) confirmButton.classList.add('is-danger');
      confirmButton.textContent = confirmLabel;
      actions.append(cancelButton, confirmButton);
      modal.append(heading, text, actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      activeConfirmDialog = overlay;

      const close = (confirmed) => {
        activeConfirmDialog = null;
        overlay.classList.add('is-leaving');
        setTimeout(() => overlay.remove(), 170);
        document.removeEventListener('keydown', onKey);
        resolve(confirmed);
      };
      const onKey = (event) => { if (event.key === 'Escape') close(false); };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close(false); });
      cancelButton.addEventListener('click', () => close(false));
      confirmButton.addEventListener('click', () => close(true));
    });
  };

  const actionButton = (label, danger, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-retry';
    if (danger) button.classList.add('is-danger');
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  };

  const renderList = (listNode, rows, buildRow) => {
    if (!listNode) return;
    listNode.replaceChildren();
    if (!rows.length) {
      listNode.appendChild(emptyItem('Nothing here yet'));
      return;
    }
    rows.forEach((row) => listNode.appendChild(buildRow(row)));
  };

  // Passwords are stored as plain text, so the operator can read them.
  // Accounts that have not signed in since the switch still hold an old
  // bcrypt hash — those convert automatically at the next sign-in.
  const displayPassword = (value) => {
    if (typeof value === 'string' && value && !value.startsWith('$2')) return value;
    return '(old hash — converts at their next sign-in, or reset it below)';
  };

  // ---------- queue actions ----------
  let afterQueueAction = null;   // set per page before deposit rows render
  let afterPayoutAction = null;  // set per page before withdrawal rows render

  const buildDepositRow = (deposit) => {
    const item = document.createElement('li');
    const details = document.createElement('div');
    const heading = document.createElement('strong');
    const subtext = document.createElement('small');
    const actions = document.createElement('div');

    heading.textContent = `#${deposit.id} · ${money(deposit.amount)} · @${deposit.username}`;
    subtext.textContent = [
      deposit.provider,
      deposit.transaction_id ? `ID: ${deposit.transaction_id}` : null,
      deposit.payer_number ? `Paid from: ${deposit.payer_number}` : null,
      deposit.status,
      deposit.created_at
    ].filter(Boolean).join(' · ');

    if (deposit.status === 'pending') {
      const onApprove = async (button) => {
        button.disabled = true;
        try {
          const result = await apiRequest(`/api/admin/deposits/${deposit.id}/approve`, { method: 'POST' });
          setNodeMessage(notice, result.message, 'success');
        } catch (error) {
          setNodeMessage(notice, error.message, 'error');
        }
        afterQueueAction?.();
      };
      const onReject = async (button) => {
        button.disabled = true;
        try {
          const result = await apiRequest(`/api/admin/deposits/${deposit.id}/reject`, { method: 'POST' });
          setNodeMessage(notice, result.message, 'success');
        } catch (error) {
          setNodeMessage(notice, error.message, 'error');
        }
        afterQueueAction?.();
      };
      actions.append(
        actionButton('Approve', false, (event) => onApprove(event.currentTarget)),
        actionButton('Reject', true, (event) => onReject(event.currentTarget))
      );
    } else {
      const status = document.createElement('b');
      status.textContent = deposit.status;
      actions.appendChild(status);
    }

    details.append(heading, subtext);
    item.append(details, actions);
    return item;
  };

  const buildWithdrawalRow = (withdrawal) => {
    const item = document.createElement('li');
    const details = document.createElement('div');
    const heading = document.createElement('strong');
    const subtext = document.createElement('small');
    const actions = document.createElement('div');

    heading.textContent = `#${withdrawal.id} · ${money(withdrawal.amount)} · @${withdrawal.username}`;
    subtext.textContent = [
      withdrawal.account_provider,
      withdrawal.account_name,
      withdrawal.account_number,
      withdrawal.status,
      withdrawal.created_at
    ].filter(Boolean).join(' · ');

    if (withdrawal.status === 'pending') {
      const onPay = async (button) => {
        button.disabled = true;
        try {
          const result = await apiRequest(`/api/admin/withdrawals/${withdrawal.id}/approve`, { method: 'POST' });
          setNodeMessage(notice, result.message, 'success');
        } catch (error) {
          setNodeMessage(notice, error.message, 'error');
        }
        afterPayoutAction?.();
      };
      const onReject = async (button) => {
        button.disabled = true;
        try {
          const result = await apiRequest(`/api/admin/withdrawals/${withdrawal.id}/reject`, { method: 'POST' });
          setNodeMessage(notice, result.message, 'success');
        } catch (error) {
          setNodeMessage(notice, error.message, 'error');
        }
        afterPayoutAction?.();
      };
      actions.append(
        actionButton('Mark paid', false, (event) => onPay(event.currentTarget)),
        actionButton('Reject', true, (event) => onReject(event.currentTarget))
      );
    } else {
      const status = document.createElement('b');
      status.textContent = withdrawal.status;
      actions.appendChild(status);
    }

    details.append(heading, subtext);
    item.append(details, actions);
    return item;
  };

  const buildSmsRow = (message) => {
    const item = document.createElement('li');
    const details = document.createElement('div');
    const heading = document.createElement('strong');
    const subtext = document.createElement('small');

    heading.textContent = message.action === 'credited'
      ? `Credited ${money(message.parsed_amount)}`
      : message.action === 'no_match'
        ? 'Unmatched payment SMS'
        : 'Ignored';
    subtext.textContent = [
      message.sender,
      message.parsed_payer ? `Payer ${message.parsed_payer}` : null,
      message.parsed_reference ? `Ref ${message.parsed_reference}` : null,
      message.created_at
    ].filter(Boolean).join(' · ');

    const body = document.createElement('div');
    body.className = 'admin-sms-body';
    body.textContent = message.body;

    details.append(heading, subtext, body);
    item.appendChild(details);
    return item;
  };

  const buildFortuneRow = (code) => {
    const item = document.createElement('li');
    const details = document.createElement('div');
    const heading = document.createElement('strong');
    const subtext = document.createElement('small');
    const actions = document.createElement('div');

    heading.textContent = `${code.code} · ${money(code.amount)}`;
    const redeemedCount = Number(code.redeemed_count) || 0;
    const maxRedemptions = Number(code.max_redemptions) || 10;
    subtext.textContent = `${redeemedCount}/${maxRedemptions} claims · Issued ${code.created_at}`;

    const status = document.createElement('b');
    status.textContent = redeemedCount >= maxRedemptions ? 'fully claimed' : 'active';
    actions.appendChild(status);

    details.append(heading, subtext);
    item.append(details, actions);
    return item;
  };

  // ---------- users list ----------
  const buildUserRow = (user) => {
    const item = document.createElement('li');
    const details = document.createElement('div');
    const heading = document.createElement('strong');
    const subtext = document.createElement('small');
    const balances = document.createElement('div');
    balances.className = 'admin-user-balances';

    heading.textContent = `@${user.username}${user.full_name && user.full_name !== user.username ? ` · ${user.full_name}` : ''}${user.role === 'admin' ? ' · operator' : ''}`;
    subtext.textContent = [
      user.email,
      user.mobile,
      user.invite_code ? `Invite ${user.invite_code}` : null,
      `Joined ${String(user.created_at || '').slice(0, 10)}`
    ].filter(Boolean).join(' · ');

    [['Available', user.withdrawable], ['Pending', user.pending], ['Total', user.total]].forEach(([label, value]) => {
      const chip = document.createElement('span');
      chip.textContent = `${label}: ${money(value)}`;
      balances.appendChild(chip);
    });

    const passwordLine = document.createElement('div');
    passwordLine.className = 'admin-password-line';
    passwordLine.textContent = `Password: ${displayPassword(user.password)}`;

    details.append(heading, subtext, balances, passwordLine);
    item.appendChild(details);

    if (user.role !== 'admin') {
      const actions = document.createElement('div');
      actions.className = 'admin-user-actions';
      const open = document.createElement('a');
      open.className = 'history-retry';
      open.href = `admin-user.html?id=${user.id}`;
      open.textContent = 'Open page';
      actions.appendChild(open);
      item.appendChild(actions);
    }
    return item;
  };

  // ---------- data loaders ----------
  const loadDeposits = async () => {
    try {
      const result = await apiRequest('/api/admin/deposits');
      renderList(document.getElementById('adminQueue'), result.deposits || [], buildDepositRow);
    } catch (error) {
      renderList(document.getElementById('adminQueue'), [], () => errorItem(error.message));
    }
  };

  const loadWithdrawals = async () => {
    try {
      const result = await apiRequest('/api/admin/withdrawals');
      renderList(document.getElementById('adminWithdrawals'), result.withdrawals || [], buildWithdrawalRow);
    } catch (error) {
      renderList(document.getElementById('adminWithdrawals'), [], () => errorItem(error.message));
    }
  };

  const loadUsers = async () => {
    try {
      const result = await apiRequest('/api/admin/users');
      renderList(document.getElementById('adminUsers'), result.users || [], buildUserRow);
    } catch (error) {
      renderList(document.getElementById('adminUsers'), [], () => errorItem(error.message));
    }
  };

  const loadSms = async () => {
    try {
      const result = await apiRequest('/api/admin/sms');
      renderList(document.getElementById('adminSmsLog'), result.messages || [], buildSmsRow);
    } catch (error) {
      renderList(document.getElementById('adminSmsLog'), [], () => errorItem(error.message));
    }
  };

  const loadFortune = async () => {
    try {
      const result = await apiRequest('/api/admin/fortune-codes');
      renderList(document.getElementById('adminFortuneList'), result.codes || [], buildFortuneRow);
    } catch (error) {
      renderList(document.getElementById('adminFortuneList'), [], () => errorItem(error.message));
    }
  };

  const loadStats = async () => {
    const statNode = document.getElementById('statPendingDeposits');
    if (!statNode) return; // stats cards only exist on the dashboard page
    try {
      const result = await apiRequest('/api/admin/stats');
      const stats = result.stats || {};
      document.getElementById('statPendingDeposits').textContent =
        `${stats.pendingDeposits?.count ?? 0} · ${money(stats.pendingDeposits?.amount)}`;
      document.getElementById('statPendingWithdrawals').textContent =
        `${stats.pendingWithdrawals?.count ?? 0} · ${money(stats.pendingWithdrawals?.amount)}`;
      document.getElementById('statUsers').textContent = String(stats.users ?? 0);
      document.getElementById('statConfirmed').textContent = money(stats.confirmedDeposits);
      document.getElementById('statUnmatchedSms').textContent = String(stats.unmatchedSms ?? 0);
    } catch (error) {
      // stats are non-critical; leave dashes
    }
  };

  const loadDashPreviews = async () => {
    const depositsNode = document.getElementById('dashDeposits');
    if (depositsNode) {
      try {
        const result = await apiRequest('/api/admin/deposits');
        const pending = (result.deposits || []).filter((d) => d.status === 'pending').slice(0, 5);
        renderList(depositsNode, pending, buildDepositRow);
      } catch (error) {
        renderList(depositsNode, [], () => errorItem(error.message));
      }
    }
    const withdrawalsNode = document.getElementById('dashWithdrawals');
    if (withdrawalsNode) {
      try {
        const result = await apiRequest('/api/admin/withdrawals');
        const pending = (result.withdrawals || []).filter((w) => w.status === 'pending').slice(0, 5);
        renderList(withdrawalsNode, pending, buildWithdrawalRow);
      } catch (error) {
        renderList(withdrawalsNode, [], () => errorItem(error.message));
      }
    }
  };

  // ---------- user detail page ----------
  let detailUserId = null;

  const kvRow = (label, value) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  };

  const loadUserDetail = async () => {
    const wrap = document.getElementById('userProfile');
    const params = new URLSearchParams(window.location.search);
    const userId = Number(params.get('id'));
    if (!Number.isInteger(userId) || userId <= 0) {
      if (wrap) renderList(wrap, [], () => errorItem('No user selected. Open a user from the Users page.'));
      return;
    }
    detailUserId = userId;
    try {
      const result = await apiRequest(`/api/admin/users/${userId}`);
      renderUserDetail(result);
    } catch (error) {
      if (wrap) renderList(wrap, [], () => errorItem(error.message));
    }
  };

  const renderUserDetail = ({ user, transactions, subscriptions }) => {
    // Profile card
    const profileList = document.getElementById('userProfileList');
    if (profileList) {
      profileList.replaceChildren(
        kvRow('Username', `@${user.username}`),
        kvRow('Full name', user.full_name || '—'),
        kvRow('Email', user.email || '—'),
        kvRow('Mobile', user.mobile || '—'),
        kvRow('Invite code', user.invite_code || '—'),
        kvRow('Referred by', user.referred_by ? `user #${user.referred_by}` : '—'),
        kvRow('Role', user.role === 'admin' ? 'operator' : 'client'),
        kvRow('Joined', String(user.created_at || '').slice(0, 10))
      );
    }

    const title = document.getElementById('userDetailTitle');
    if (title) title.textContent = `@${user.username}`;

    // Wallet card
    const walletList = document.getElementById('userWalletList');
    if (walletList) {
      walletList.replaceChildren(
        kvRow('Available', money(user.withdrawable)),
        kvRow('Pending (reserved)', money(user.pending)),
        kvRow('Total ever', money(user.total))
      );
    }

    // Password card
    const passwordBox = document.getElementById('userPassword');
    if (passwordBox) passwordBox.textContent = displayPassword(user.password);

    // Adjust + delete controls only for client accounts
    const isAdminTarget = user.role === 'admin';
    const controlsCard = document.getElementById('userControlsCard');
    const dangerCard = document.getElementById('userDangerCard');
    if (isAdminTarget) {
      if (controlsCard) controlsCard.hidden = true;
      if (dangerCard) dangerCard.hidden = true;
    }

    // onclick (not addEventListener): the detail page re-renders after every
    // action, and these buttons are static — assignment keeps one handler only.
    const addMoneyBtn = document.getElementById('addMoneyBtn');
    const takeMoneyBtn = document.getElementById('takeMoneyBtn');
    const adjustApply = async (sign) => {
      const raw = Number(document.getElementById('adjustAmount').value);
      if (!Number.isSafeInteger(raw) || raw <= 0) {
        setNodeMessage(notice, 'Type a whole UGX amount first.', 'error');
        return;
      }
      const confirmed = await confirmDialog({
        title: `${sign === 'add' ? 'Add' : 'Take'} UGX ${raw.toLocaleString()}?`,
        body: `This will ${sign === 'add' ? 'add UGX ' + raw.toLocaleString() + ' to' : 'take UGX ' + raw.toLocaleString() + ' from'} @${user.username}'s available balance and record it in their history.`,
        confirmLabel: sign === 'add' ? 'Add money' : 'Take money'
      });
      if (!confirmed) return;
      try {
        const result = await apiRequest(`/api/admin/users/${user.id}/balance`, {
          method: 'POST',
          body: JSON.stringify({ amount: sign === 'add' ? raw : -raw })
        });
        setNodeMessage(notice, result.message, 'success');
        document.getElementById('adjustAmount').value = '';
        loadUserDetail();
      } catch (error) {
        setNodeMessage(notice, error.message, 'error');
      }
    };
    if (addMoneyBtn) addMoneyBtn.onclick = () => adjustApply('add');
    if (takeMoneyBtn) takeMoneyBtn.onclick = () => adjustApply('take');

    const passwordForm = document.getElementById('passwordResetForm');
    if (passwordForm) passwordForm.onsubmit = async (event) => {
      event.preventDefault();
      const newPassword = document.getElementById('newPassword').value.trim();
      if (newPassword.length < 6 || newPassword.length > 72) {
        setNodeMessage(notice, 'The new password must be 6 to 72 characters.', 'error');
        return;
      }
      const confirmed = await confirmDialog({
        title: `Reset @${user.username}'s password?`,
        body: 'Their current password stops working immediately and is replaced by the new one, which you can read right here.',
        confirmLabel: 'Reset password'
      });
      if (!confirmed) return;
      try {
        const result = await apiRequest(`/api/admin/users/${user.id}/password`, {
          method: 'POST',
          body: JSON.stringify({ newPassword })
        });
        setNodeMessage(notice, result.message, 'success');
        document.getElementById('newPassword').value = '';
        loadUserDetail();
      } catch (error) {
        setNodeMessage(notice, error.message, 'error');
      }
    };

    const deleteBtn = document.getElementById('deleteUserBtn');
    if (deleteBtn) deleteBtn.onclick = async () => {
      const confirmed = await confirmDialog({
        title: `Delete @${user.username}?`,
        body: 'Their wallet, transactions, deposits, withdrawals, subscriptions and fortune history are removed permanently. This cannot be undone.',
        confirmLabel: 'Delete forever',
        danger: true
      });
      if (!confirmed) return;
      try {
        const result = await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' });
        setNodeMessage(notice, result.message, 'success');
        setTimeout(() => { window.location.href = 'admin-users.html'; }, 600);
      } catch (error) {
        setNodeMessage(notice, error.message, 'error');
      }
    };

    // Transactions
    const txNode = document.getElementById('userTransactions');
    if (txNode) {
      txNode.replaceChildren();
      if (!transactions || !transactions.length) {
        txNode.appendChild(emptyItem('No transactions yet'));
      } else {
        transactions.forEach((tx) => {
          const item = document.createElement('li');
          const details = document.createElement('div');
          const heading = document.createElement('strong');
          const subtext = document.createElement('small');
          const sign = tx.amount < 0 ? '−' : '+';
          heading.textContent = `${tx.type.replace(/_/g, ' ')} · ${sign}${money(Math.abs(tx.amount))}`;
          subtext.textContent = `${tx.status} · ${tx.created_at}`;
          details.append(heading, subtext);
          item.appendChild(details);
          txNode.appendChild(item);
        });
      }
    }

    // Subscriptions
    const subNode = document.getElementById('userSubscriptions');
    if (subNode) {
      subNode.replaceChildren();
      if (!subscriptions || !subscriptions.length) {
        subNode.appendChild(emptyItem('No ToonHub subscriptions yet'));
      } else {
        subscriptions.forEach((sub) => {
          const item = document.createElement('li');
          const details = document.createElement('div');
          const heading = document.createElement('strong');
          const subtext = document.createElement('small');
          heading.textContent = `Level ${sub.level} · ${money(sub.amount)}`;
          subtext.textContent = `${sub.status} · updated ${sub.updated_at}`;
          details.append(heading, subtext);
          item.appendChild(details);
          subNode.appendChild(item);
        });
      }
    }
  };

  // ---------- refresh buttons ----------
  const loaders = {
    deposits: loadDeposits,
    withdrawals: loadWithdrawals,
    users: loadUsers,
    sms: loadSms,
    fortune: loadFortune
  };

  document.querySelectorAll('[data-refresh]').forEach((button) => {
    button.addEventListener('click', () => {
      loaders[button.dataset.refresh]?.();
      loadStats();
    });
  });

  // ---------- forms ----------
  const smsForm = document.getElementById('smsForm');
  smsForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = document.getElementById('smsBody').value.trim();
    const sender = document.getElementById('smsSender').value.trim();
    if (!body) return;
    try {
      const result = await apiRequest('/api/sms/ingest', {
        method: 'POST',
        body: JSON.stringify({ sender, body })
      });
      const outcome = result.results && result.results[0];
      if (outcome && outcome.action === 'credited') {
        setNodeMessage(document.getElementById('smsMessage'), 'Matched a pending deposit — wallet credited automatically.', 'success');
        event.target.reset();
      } else if (outcome && outcome.action === 'no_match') {
        setNodeMessage(document.getElementById('smsMessage'), 'Payment recognized, but no pending deposit matched (amount + payer number). Ask the user to submit the deposit, then process again.', 'error');
      } else {
        setNodeMessage(document.getElementById('smsMessage'), 'Not recognized as an MTN/Airtel payment SMS.', 'error');
      }
      loadDeposits();
      loadStats();
    } catch (error) {
      setNodeMessage(document.getElementById('smsMessage'), error.message, 'error');
    }
  });

  const fortuneForm = document.getElementById('fortuneForm');
  fortuneForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = Number(document.getElementById('fortuneAmount').value);
    try {
      const result = await apiRequest('/api/admin/fortune-codes', {
        method: 'POST',
        body: JSON.stringify({ amount })
      });
      setNodeMessage(document.getElementById('fortuneMessage'), `Code: ${result.code} (${money(result.amount)}) — give it to the winner.`, 'success');
      event.target.reset();
      loadFortune();
    } catch (error) {
      setNodeMessage(document.getElementById('fortuneMessage'), error.message, 'error');
    }
  });

  // ---------- sign out ----------
  document.getElementById('adminSignOut')?.addEventListener('click', () => {
    sessionStorage.removeItem(adminTokenStorage);
    window.location.replace('index.html');
  });

  // ---------- page boot ----------
  const boot = {
    dashboard: () => { afterQueueAction = () => { loadDashPreviews(); loadStats(); }; afterPayoutAction = afterQueueAction; loadStats(); loadDashPreviews(); },
    deposits: () => { afterQueueAction = () => loadDeposits(); loadDeposits(); },
    withdrawals: () => { afterPayoutAction = () => loadWithdrawals(); loadWithdrawals(); },
    users: () => loadUsers(),
    user: loadUserDetail,
    sms: () => loadSms(),
    fortune: () => loadFortune()
  };

  // Single sign-in page: without an admin session every admin page sends the
  // visitor to index.html, where the system routes everyone by role.
  if (sessionStorage.getItem(adminTokenStorage)) {
    apiRequest('/api/admin/stats')
      .then(() => { (boot[page] || (() => {}))(); })
      .catch(() => {
        sessionStorage.removeItem(adminTokenStorage);
        window.location.replace('index.html');
      });
  } else {
    window.location.replace('index.html');
  }
})();
