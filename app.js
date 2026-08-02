const members = [
  { id: 1, name: 'Maya Bennett', address: '128 Harbor Walk, Long Beach, CA', city: 'Long Beach', lat: 33.7701, lon: -118.1937 },
  { id: 2, name: 'Daniel Cho', address: '74 Ocean Terrace, Seal Beach, CA', city: 'Seal Beach', lat: 33.7414, lon: -118.1048 },
  { id: 3, name: 'Elena Ramirez', address: '215 Citrus Lane, Anaheim, CA', city: 'Anaheim', lat: 33.8366, lon: -117.9143 },
  { id: 4, name: 'Marcus Green', address: '49 Magnolia Court, Santa Ana, CA', city: 'Santa Ana', lat: 33.7455, lon: -117.8677 },
  { id: 5, name: 'Nora Patel', address: '302 Coastline Drive, Huntington Beach, CA', city: 'Huntington Beach', lat: 33.6595, lon: -117.9988 },
  { id: 6, name: 'Theo Williams', address: '88 Jacaranda Way, Pasadena, CA', city: 'Pasadena', lat: 34.1478, lon: -118.1445 },
  { id: 7, name: 'Sofia Kim', address: '167 Market Street, Irvine, CA', city: 'Irvine', lat: 33.6846, lon: -117.8265 },
  { id: 8, name: 'Caleb Morgan', address: '510 Palisade Avenue, Torrance, CA', city: 'Torrance', lat: 33.8358, lon: -118.3406 },
  { id: 9, name: 'Avery Johnson', address: '23 Foothill Place, Claremont, CA', city: 'Claremont', lat: 34.0967, lon: -117.7198 },
  { id: 10, name: 'Isla Thompson', address: '411 Marina View, Oceanside, CA', city: 'Oceanside', lat: 33.1959, lon: -117.3795 },
];

const avatarColors = ['#dcece5', '#f5e2dc', '#e5e2f3', '#f2ead6', '#dbeaf2'];
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

let selectedId = null;
let selectionVersion = 0;

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function memberOption(member) {
  const button = document.createElement('button');
  button.className = 'member-option';
  button.type = 'button';
  button.role = 'option';
  button.dataset.id = member.id;
  button.setAttribute('aria-selected', String(member.id === selectedId));
  button.innerHTML = `
    <span class="avatar" style="--avatar-bg:${avatarColors[(member.id - 1) % avatarColors.length]}">${initials(member.name)}</span>
    <span><span class="member-name">${member.name}</span><span class="member-city">${member.city}, CA</span></span>
    <span class="chevron" aria-hidden="true">›</span>
  `;
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
    message.textContent = 'No matching people found.';
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
  item.innerHTML = `
    <span class="rank">${String(index + 1).padStart(2, '0')}</span>
    <span class="avatar" style="--avatar-bg:${avatarColors[(member.id - 1) % avatarColors.length]}">${initials(member.name)}</span>
    <span class="result-copy"><strong>${member.name}</strong><span>${member.address}</span></span>
    <span class="distance">${member.distance.toFixed(1)} <small>miles${member.durationMinutes ? ` · ${member.durationMinutes} min` : ' direct'}</small></span>
  `;
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
  const others = members.filter((member) => member.id !== id);
  let ranked = others
    .map((member) => ({ ...member, distance: distanceMiles(selected, member) }))
    .sort((a, b) => a.distance - b.distance);

  selectedName.textContent = selected.name;
  selectedAddress.textContent = selected.address;
  selectedAvatar.textContent = initials(selected.name);
  emptyState.hidden = true;
  resultsList.replaceChildren(...ranked.map(resultRow));
  renderDirectory(search.value);

  sortLabel.classList.add('is-loading');
  sortLabel.lastChild.textContent = ' Calculating drive times…';

  try {
    const routes = await fetchDrivingRoutes(selected, others);
    if (version !== selectionVersion) return;

    if (routes?.length) {
      const byDestination = new Map(routes.map((route) => [route.destinationIndex, route]));
      ranked = others
        .map((member, destinationIndex) => {
          const route = byDestination.get(destinationIndex);
          return {
            ...member,
            distance: route?.distanceMiles ?? distanceMiles(selected, member),
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

search.addEventListener('input', (event) => renderDirectory(event.target.value));
renderDirectory();
