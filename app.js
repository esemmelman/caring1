const avatarColors = ['#dcece5', '#f5e2dc', '#e5e2f3', '#f2ead6', '#dbeaf2'];
const RESULT_LIMIT = 24;
const list = document.querySelector('#member-list');
const count = document.querySelector('#member-count');
const search = document.querySelector('#member-search');
const selectedName = document.querySelector('#selected-name');
const selectedAddress = document.querySelector('#selected-address');
const selectedContact = document.querySelector('#selected-contact');
const selectedAvatar = document.querySelector('#selected-avatar');
const resultsList = document.querySelector('#results-list');
const emptyState = document.querySelector('#empty-state');
const sortLabel = document.querySelector('#sort-label');
const directoryActions = document.querySelector('#directory-actions');
const directoryStatus = document.querySelector('#directory-status');
const addMemberButton = document.querySelector('#add-member-button');
const editMemberButton = document.querySelector('#edit-member-button');
const deleteMemberButton = document.querySelector('#delete-member-button');
const memberDialog = document.querySelector('#member-dialog');
const memberForm = document.querySelector('#member-form');
const memberDialogTitle = document.querySelector('#member-dialog-title');
const memberDialogStatus = document.querySelector('#member-dialog-status');
const memberIdInput = document.querySelector('#member-id');
const memberNameInput = document.querySelector('#member-name');
const memberAddressInput = document.querySelector('#member-address');
const memberEmailInput = document.querySelector('#member-email');
const memberPhoneInput = document.querySelector('#member-phone');
const config = window.CARING_CONFIG ?? {};

let members = [];
let selectedId = null;
let selectionVersion = 0;
let canManage = false;

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function colorIndex(id) {
  let hash = 0;
  for (const character of String(id)) hash = ((hash << 5) - hash) + character.charCodeAt(0);
  return Math.abs(hash) % avatarColors.length;
}

function cityFromAddress(address) {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.at(-2) : '';
}

function avatar(name, id) {
  const element = document.createElement('span');
  element.className = 'avatar';
  element.style.setProperty('--avatar-bg', avatarColors[colorIndex(id)]);
  element.textContent = initials(name);
  return element;
}

function memberOption(member) {
  const button = document.createElement('button');
  button.className = 'member-option';
  button.type = 'button';
  button.role = 'option';
  button.dataset.id = member.id;
  button.setAttribute('aria-selected', String(member.id === selectedId));

  const copy = document.createElement('span');
  copy.className = 'member-copy';
  const name = document.createElement('span');
  name.className = 'member-name';
  name.textContent = member.name;
  const address = document.createElement('span');
  address.className = 'member-address';
  address.textContent = member.address;
  copy.append(name, address);

  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';

  button.append(avatar(member.name, member.id), copy, chevron);
  button.addEventListener('click', () => selectMember(member.id));
  return button;
}

function renderDirectory(query = '') {
  const normalized = query.trim().toLowerCase();
  const filtered = members.filter((member) =>
    `${member.name} ${member.address}`.toLowerCase().includes(normalized)
  );

  list.replaceChildren(...filtered.map(memberOption));
  count.textContent = filtered.length;

  if (!filtered.length) {
    const message = document.createElement('p');
    message.className = 'no-matches';
    message.textContent = members.length ? 'No matching people found.' : 'No directory members are available.';
    list.append(message);
  }

  editMemberButton.disabled = !canManage || !selectedId;
  deleteMemberButton.disabled = !canManage || !selectedId;
}

function distanceMiles(a, b) {
  const earthRadiusMiles = 3958.8;
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function resultRow(member, index) {
  const item = document.createElement('li');
  item.className = 'result-row';
  item.role = 'button';
  item.tabIndex = 0;
  item.setAttribute('aria-label', `Show contact details for ${member.name}`);
  item.style.animationDelay = `${Math.min(index * 35, 250)}ms`;

  const rank = document.createElement('span');
  rank.className = 'rank';
  rank.textContent = String(index + 1).padStart(2, '0');

  const copy = document.createElement('span');
  copy.className = 'result-copy';
  const name = document.createElement('strong');
  name.textContent = member.name;
  const address = document.createElement('span');
  address.textContent = member.address;
  copy.append(name, address);

  const distance = document.createElement('span');
  distance.className = 'distance';
  distance.append(`${member.distance.toFixed(1)} `);
  const detail = document.createElement('small');
  detail.textContent = `miles${member.durationMinutes ? ` · ${member.durationMinutes} min` : ' direct'}`;
  distance.append(detail);

  item.append(rank, avatar(member.name, member.id), copy, distance);
  item.addEventListener('click', () => selectMember(member.id));
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectMember(member.id);
    }
  });
  return item;
}

function showContactDetails(member) {
  selectedContact.replaceChildren();

  if (member.phone) {
    const phone = document.createElement('a');
    phone.href = `tel:${member.phone.replace(/[^\d+]/g, '')}`;
    phone.textContent = member.phone;
    phone.setAttribute('aria-label', `Call ${member.name} at ${member.phone}`);
    selectedContact.append(phone);
  }

  if (member.email) {
    const email = document.createElement('a');
    email.href = `mailto:${member.email}`;
    email.textContent = member.email;
    email.setAttribute('aria-label', `Email ${member.name} at ${member.email}`);
    selectedContact.append(email);
  }

  selectedContact.hidden = !selectedContact.childElementCount;
}

function clearSelection() {
  selectedId = null;
  selectionVersion += 1;
  selectedName.textContent = 'Select someone';
  selectedAddress.textContent = 'Choose a person from the directory to begin.';
  selectedAvatar.textContent = '';
  selectedContact.replaceChildren();
  selectedContact.hidden = true;
  resultsList.replaceChildren();
  emptyState.hidden = false;
}

async function fetchDrivingRoutes(origin, destinations) {
  if (!config.routeMatrixUrl || typeof config.getAccessToken !== 'function') return null;
  const accessToken = await config.getAccessToken();
  if (!accessToken) return null;

  const response = await fetch(config.routeMatrixUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      origin: { lat: origin.lat, lon: origin.lon },
      destinations: destinations.map(({ lat, lon }) => ({ lat, lon })),
    }),
  });

  if (!response.ok) throw new Error('Driving routes are unavailable.');
  return (await response.json()).routes;
}

async function selectMember(id) {
  const version = ++selectionVersion;
  selectedId = id;
  const selected = members.find((member) => member.id === id);
  const candidates = members
    .filter((member) => member.id !== id)
    .map((member) => ({ ...member, distance: distanceMiles(selected, member) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, RESULT_LIMIT);

  selectedName.textContent = selected.name;
  selectedAddress.textContent = selected.address;
  selectedAvatar.textContent = initials(selected.name);
  showContactDetails(selected);
  emptyState.hidden = true;
  resultsList.replaceChildren(...candidates.map(resultRow));
  renderDirectory(search.value);

  sortLabel.classList.add('is-loading');
  sortLabel.lastChild.textContent = ' Calculating drive times…';

  try {
    const routes = await fetchDrivingRoutes(selected, candidates);
    if (version !== selectionVersion) return;

    if (routes?.length) {
      const byDestination = new Map(routes.map((route) => [route.destinationIndex, route]));
      const ranked = candidates
        .map((member, destinationIndex) => {
          const route = byDestination.get(destinationIndex);
          return {
            ...member,
            distance: route?.distanceMiles ?? member.distance,
            durationMinutes: route?.durationMinutes ?? null,
          };
        })
        .sort((a, b) => (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity));
      resultsList.replaceChildren(...ranked.map(resultRow));
      sortLabel.lastChild.textContent = ' Closest drive first';
    } else {
      sortLabel.lastChild.textContent = ' Closest direct distance';
    }
  } catch (error) {
    if (version === selectionVersion) {
      console.warn(error.message);
      sortLabel.lastChild.textContent = ' Direct-distance fallback';
    }
  } finally {
    if (version === selectionVersion) sortLabel.classList.remove('is-loading');
  }
}

function openMemberDialog(member = null) {
  memberForm.reset();
  memberDialogStatus.textContent = '';
  memberDialogTitle.textContent = member ? 'Edit member' : 'Add member';
  memberIdInput.value = member?.id ?? '';
  memberNameInput.value = member?.name ?? '';
  memberAddressInput.value = member?.address ?? '';
  memberEmailInput.value = member?.email ?? '';
  memberPhoneInput.value = member?.phone ?? '';
  memberDialog.showModal();
  memberNameInput.focus();
}

async function adminRequest(payload) {
  if (!config.memberAdminUrl || typeof config.getAccessToken !== 'function') {
    throw new Error('Directory administration is not configured.');
  }
  const accessToken = await config.getAccessToken();
  if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

  const response = await fetch(config.memberAdminUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Unable to update the directory.');
  return body;
}

async function saveMember(event) {
  event.preventDefault();
  const saveButton = memberForm.querySelector('[type="submit"]');
  saveButton.disabled = true;
  memberDialogStatus.textContent = 'Saving and validating the address…';

  try {
    const id = memberIdInput.value;
    const result = await adminRequest({
      action: id ? 'update' : 'create',
      id: id || undefined,
      name: memberNameInput.value,
      address: memberAddressInput.value,
      email: memberEmailInput.value,
      phone: memberPhoneInput.value,
    });
    memberDialog.close();
    directoryStatus.textContent = id ? 'Member updated.' : 'Member added.';
    await loadMembers(result.id);
  } catch (error) {
    memberDialogStatus.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteSelectedMember() {
  const member = members.find((candidate) => candidate.id === selectedId);
  if (!member || !window.confirm(`Delete ${member.name} from the directory? This cannot be undone.`)) return;

  deleteMemberButton.disabled = true;
  directoryStatus.textContent = 'Deleting member…';
  try {
    await adminRequest({ action: 'delete', id: member.id });
    members = members.filter((candidate) => candidate.id !== member.id);
    clearSelection();
    directoryStatus.textContent = 'Member deleted.';
    await loadMembers();
  } catch (error) {
    directoryStatus.textContent = error.message;
  } finally {
    renderDirectory(search.value);
  }
}

async function loadMembers(preferredId = null) {
  list.innerHTML = '<p class="no-matches">Loading directory…</p>';
  if (!config.memberDirectoryUrl || typeof config.getAccessToken !== 'function') {
    throw new Error('The member directory is not configured.');
  }

  const accessToken = await config.getAccessToken();
  if (!accessToken) return;

  const response = await fetch(config.memberDirectoryUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Unable to load the directory.');

  await showDirectory(body, preferredId);
}

async function showDirectory(body, preferredId = null) {
  canManage = body.canManage === true;
  directoryActions.hidden = !canManage;
  members = (body.members ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    address: member.address,
    city: cityFromAddress(member.address),
    lat: member.latitude,
    lon: member.longitude,
    email: member.email,
    phone: member.phone,
  }));
  if (selectedId && !members.some((member) => member.id === selectedId)) clearSelection();
  renderDirectory();
  if (preferredId && members.some((member) => member.id === preferredId)) {
    await selectMember(preferredId);
  }
}

search.addEventListener('input', (event) => renderDirectory(event.target.value));
addMemberButton.addEventListener('click', () => openMemberDialog());
editMemberButton.addEventListener('click', () => {
  const member = members.find((candidate) => candidate.id === selectedId);
  if (member) openMemberDialog(member);
});
deleteMemberButton.addEventListener('click', deleteSelectedMember);
memberForm.addEventListener('submit', saveMember);
document.querySelector('#member-dialog-close').addEventListener('click', () => memberDialog.close());
document.querySelector('#member-cancel-button').addEventListener('click', () => memberDialog.close());
window.addEventListener('caring-unlocked', (event) => showDirectory(event.detail).catch((error) => {
  console.error(error);
  list.innerHTML = '';
  const message = document.createElement('p');
  message.className = 'no-matches';
  message.textContent = error.message;
  list.append(message);
}));
