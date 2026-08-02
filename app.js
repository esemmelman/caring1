const avatarColors = ['#dcece5', '#f5e2dc', '#e5e2f3', '#f2ead6', '#dbeaf2'];
const RESULT_LIMIT = 24;
const list = document.querySelector('#member-list');
const count = document.querySelector('#member-count');
const search = document.querySelector('#member-search');
const selectedName = document.querySelector('#selected-name');
const selectedAddress = document.querySelector('#selected-address');
const selectedAvatar = document.querySelector('#selected-avatar');
const resultsList = document.querySelector('#results-list');
const emptyState = document.querySelector('#empty-state');
const sortLabel = document.querySelector('#sort-label');
const config = window.CARING_CONFIG ?? {};

let members = [];
let selectedId = null;
let selectionVersion = 0;

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
  const name = document.createElement('span');
  name.className = 'member-name';
  name.textContent = member.name;
  const city = document.createElement('span');
  city.className = 'member-city';
  city.textContent = member.city;
  copy.append(name, city);

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
    `${member.name} ${member.city}`.toLowerCase().includes(normalized)
  );

  list.replaceChildren(...filtered.map(memberOption));
  count.textContent = filtered.length;

  if (!filtered.length) {
    const message = document.createElement('p');
    message.className = 'no-matches';
    message.textContent = members.length ? 'No matching people found.' : 'No directory members are available.';
    list.append(message);
  }
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
  return item;
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

async function loadMembers() {
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

  members = (body.members ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    address: member.address,
    city: cityFromAddress(member.address),
    lat: member.latitude,
    lon: member.longitude,
  }));
  renderDirectory();
}

search.addEventListener('input', (event) => renderDirectory(event.target.value));
loadMembers().catch((error) => {
  console.error(error);
  list.innerHTML = '';
  const message = document.createElement('p');
  message.className = 'no-matches';
  message.textContent = error.message;
  list.append(message);
});
