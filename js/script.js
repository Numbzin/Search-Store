// Variáveis globais
let map;
let markers = [];
let currentStores = [];
let selectedCategory = null;
let currentCoords = null;
let searchCircle = null;

// Elementos do DOM
const elements = {
  address: document.getElementById("address"),
  searchRadius: document.getElementById("search-radius"),
  radiusValue: document.getElementById("radius-value"),
  searchButton: document.getElementById("search-button"),
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
  categories: document.getElementById("categories"),
  results: document.getElementById("results"),
  resultsTitle: document.getElementById("results-title"),
};

// Inicializa a aplicação
function init() {
  // Inicializa o mapa com centro no Brasil
  initMap();

  // Event listeners
  elements.address.addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchStores();
  });

  elements.searchButton.addEventListener("click", searchStores);

  elements.searchRadius.addEventListener("input", () => {
    const value = elements.searchRadius.value;
    elements.radiusValue.textContent = `${value} km`;

    // Se tiver coordenadas e círculo, atualiza o círculo no mapa
    if (currentCoords && searchCircle) {
      searchCircle.setRadius(value * 1000);
    }
  });
}

// Inicializa o mapa
function initMap(lat = -15.8, lng = -47.9) {
  // Remove o mapa anterior se existir
  if (map) map.remove();

  // Cria novo mapa
  map = L.map("map").setView([lat, lng], lat === -15.8 ? 4 : 15);

  // Adiciona camada de mapa
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);

  // Limpa os marcadores
  markers = [];
}

// Geocodifica o endereço para obter coordenadas
async function geocodeAddress(address) {
  try {
    toggleLoading(true);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        address
      )}&limit=1`
    );

    if (!response.ok) {
      throw new Error("Erro na conexão com o servidor de geocodificação");
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      showError("Endereço não encontrado. Tente ser mais específico.");
      return null;
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch (error) {
    showError(`Erro ao buscar endereço: ${error.message}`);
    return null;
  } finally {
    toggleLoading(false);
  }
}

// Busca lojas próximas às coordenadas
async function getNearbyStores(lat, lng, radius) {
  // Constrói a query Overpass
  const query = `
    [out:json];
    (
      node["shop"](around:${radius * 1000},${lat},${lng});
      way["shop"](around:${radius * 1000},${lat},${lng});
      relation["shop"](around:${radius * 1000},${lat},${lng});
    );
    out center;
  `;

  try {
    toggleLoading(true);

    const response = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
        query
      )}`
    );

    if (!response.ok) {
      throw new Error("Erro na conexão com o servidor Overpass");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    showError(`Erro ao buscar lojas: ${error.message}`);
    return null;
  } finally {
    toggleLoading(false);
  }
}

// Cria os botões de categoria
function createCategoryButtons(stores) {
  // Limpa o container de categorias
  elements.categories.innerHTML = "";

  if (!stores || !stores.elements || stores.elements.length === 0) {
    elements.categories.style.display = "none";
    return;
  }

  elements.categories.style.display = "flex";

  // Obtém categorias únicas
  const categories = [
    ...new Set(
      stores.elements.map((store) => {
        // Normaliza e formata a categoria
        const category = store.tags.shop || "outros";
        return formatCategoryName(category);
      })
    ),
  ].sort();

  // Cria fragmento para melhor performance
  const fragment = document.createDocumentFragment();

  // Botão 'Todos'
  const allButton = document.createElement("button");
  allButton.className = `category-btn ${!selectedCategory ? "active" : ""}`;
  allButton.textContent = "Todas";
  allButton.onclick = () => {
    selectedCategory = null;
    updateCategorySelection(allButton);
    displayResults(currentStores);
  };
  fragment.appendChild(allButton);

  // Botões para cada categoria
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.className = `category-btn ${
      selectedCategory === category ? "active" : ""
    }`;
    button.textContent = category;
    button.onclick = () => {
      selectedCategory = category;
      updateCategorySelection(button);
      displayResults(currentStores);
    };
    fragment.appendChild(button);
  });

  // Adiciona todos os botões de uma vez
  elements.categories.appendChild(fragment);
}

// Atualiza seleção de categoria
function updateCategorySelection(selectedButton) {
  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  selectedButton.classList.add("active");
}

// Formata nome da categoria
function formatCategoryName(category) {
  // Dicionário de tradução para categorias comuns
  const translations = {
    supermarket: "Supermercado",
    convenience: "Conveniência",
    clothes: "Roupas",
    bakery: "Padaria",
    butcher: "Açougue",
    shoes: "Calçados",
    electronics: "Eletrônicos",
    mobile_phone: "Celulares",
    furniture: "Móveis",
    department_store: "Loja de Departamento",
    mall: "Shopping",
    hardware: "Materiais de Construção",
    outros: "Outros",
  };

  return (
    translations[category.toLowerCase()] ||
    category.charAt(0).toUpperCase() + category.slice(1).replace("_", " ")
  );
}

// Exibe resultados
function displayResults(stores) {
  // Atualiza stores atuais
  currentStores = stores;

  // Limpa resultados anteriores
  elements.results.innerHTML = "";

  // Verifica se há lojas
  if (!stores || !stores.elements || stores.elements.length === 0) {
    elements.results.innerHTML = `
      <div class="empty-results">
        <p>Nenhuma loja encontrada nesta área</p>
      </div>
    `;
    elements.resultsTitle.setAttribute("data-count", "(0)");
    return;
  }

  // Filtra lojas pela categoria selecionada
  const filteredStores = selectedCategory
    ? stores.elements.filter((store) => {
        const storeCategory = formatCategoryName(store.tags.shop || "outros");
        return storeCategory === selectedCategory;
      })
    : stores.elements;

  // Atualiza contagem nos resultados
  elements.resultsTitle.setAttribute(
    "data-count",
    `(${filteredStores.length})`
  );

  // Se não houver lojas após o filtro
  if (filteredStores.length === 0) {
    elements.results.innerHTML = `
      <div class="empty-results">
        <p>Nenhuma loja encontrada na categoria "${selectedCategory}"</p>
      </div>
    `;
    return;
  }

  // Limpa marcadores atuais
  clearMarkers();

  // Cria fragmento para melhor performance
  const fragment = document.createDocumentFragment();

  // Adiciona cada loja
  filteredStores.forEach((store) => {
    const card = createStoreCard(store);
    fragment.appendChild(card);

    // Adiciona marcador no mapa
    addMarkerToMap(store);
  });

  // Adiciona todos os cards de uma vez
  elements.results.appendChild(fragment);
}

// Cria card de loja
function createStoreCard(store) {
  const card = document.createElement("div");
  card.className = "store-card";

  // Extrai os detalhes da loja
  const details = {
    nome: store.tags.name || store.tags.brand || "Loja sem nome",
    rua: store.tags["addr:street"] || "",
    numero: store.tags["addr:housenumber"] || "",
    cidade: store.tags["addr:city"] || "",
    estado: store.tags["addr:state"] || "",
    cep: store.tags["addr:postcode"] || "",
    tipo: formatCategoryName(store.tags.shop || "outros"),
    phone: store.tags.phone || store.tags["contact:phone"] || "",
    website: store.tags.website || store.tags["contact:website"] || "",
  };

  // Constrói consulta de endereço para Google Maps
  const addressQuery = [
    details.nome,
    details.rua,
    details.numero,
    details.cidade,
    details.estado,
    details.cep,
  ]
    .filter(Boolean)
    .join(", ");

  // Extrai coordenadas
  const coords = {
    lat: store.lat || store.center.lat,
    lng: store.lon || store.center.lon,
  };

  // Cria URL para o Google Maps
  const mapsURL = addressQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        addressQuery
      )}`
    : `https://www.google.com/maps/@${coords.lat},${coords.lng},18z`;

  // Constrói o HTML do card
  card.innerHTML = `
    <h3>${details.nome}</h3>
    ${details.rua ? `<p>${details.rua} ${details.numero}</p>` : ""}
    ${
      details.cidade
        ? `<p>${details.cidade}${
            details.estado ? " - " + details.estado : ""
          }</p>`
        : ""
    }
    ${details.phone ? `<p>📞 ${details.phone}</p>` : ""}
    <small>${details.tipo}</small>
  `;

  // Adiciona evento de clique para abrir no Google Maps
  card.addEventListener("click", () => {
    window.open(mapsURL, "_blank");
  });

  // Adiciona evento de hover para destacar o marcador correspondente
  card.addEventListener("mouseenter", () => {
    const marker = findMarkerByCoords(coords.lat, coords.lng);
    if (marker) {
      marker.setIcon(createMarkerIcon(true));
      marker.openPopup();
    }
  });

  card.addEventListener("mouseleave", () => {
    const marker = findMarkerByCoords(coords.lat, coords.lng);
    if (marker) {
      marker.setIcon(createMarkerIcon(false));
      marker.closePopup();
    }
  });

  return card;
}

// Adiciona marcador ao mapa
function addMarkerToMap(store) {
  // Extrai nome e coordenadas
  const name = store.tags.name || store.tags.brand || "Loja sem nome";
  const lat = store.lat || store.center.lat;
  const lng = store.lon || store.center.lon;

  // Cria o marcador
  const marker = L.marker([lat, lng], {
    icon: createMarkerIcon(false),
    riseOnHover: true,
  }).addTo(map);

  // Adiciona popup com informações
  marker.bindPopup(`
    <strong>${name}</strong><br>
    ${
      store.tags["addr:street"]
        ? store.tags["addr:street"] +
          " " +
          (store.tags["addr:housenumber"] || "") +
          "<br>"
        : ""
    }
    ${formatCategoryName(store.tags.shop || "outros")}
  `);

  // Guarda referência ao marcador
  markers.push({
    marker,
    lat,
    lng,
    id: store.id,
  });

  return marker;
}

// Cria ícone personalizado para marcador
function createMarkerIcon(isHighlighted) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${isHighlighted ? "14px" : "12px"};
      height: ${isHighlighted ? "14px" : "12px"};
      background-color: ${isHighlighted ? "#1d4ed8" : "#3b82f6"};
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 ${isHighlighted ? "6px" : "4px"} rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [isHighlighted ? 14 : 12, isHighlighted ? 14 : 12],
    iconAnchor: [isHighlighted ? 7 : 6, isHighlighted ? 7 : 6],
  });
}

// Encontra marcador por coordenadas
function findMarkerByCoords(lat, lng) {
  // Precisão para comparação de coordenadas
  const precision = 0.0000001;

  const found = markers.find(
    (m) =>
      Math.abs(m.lat - lat) < precision && Math.abs(m.lng - lng) < precision
  );

  return found ? found.marker : null;
}

// Limpa marcadores do mapa
function clearMarkers() {
  markers.forEach(({ marker }) => map.removeLayer(marker));
  markers = [];
}

// Exibe overlay de carregamento
function toggleLoading(show) {
  elements.loading.style.display = show ? "flex" : "none";
}

// Exibe mensagem de erro
function showError(message) {
  elements.error.textContent = message;
  elements.error.style.display = "block";
  setTimeout(() => (elements.error.style.display = "none"), 5000);
}

// Fluxo principal de busca
async function searchStores() {
  const address = elements.address.value.trim();
  const radius = parseFloat(elements.searchRadius.value);

  if (!address) {
    showError("Por favor, digite um endereço válido");
    return;
  }

  try {
    // Limpa estado anterior
    selectedCategory = null;

    // Obtém coordenadas do endereço
    const coords = await geocodeAddress(address);
    if (!coords) return;

    // Salva coordenadas atuais
    currentCoords = coords;

    // Atualiza mapa
    initMap(coords.lat, coords.lng);

    // Adiciona marcador para o endereço buscado
    const locationMarker = L.marker([coords.lat, coords.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          width: 16px;
          height: 16px;
          background-color: #ef4444;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 0 5px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(map);

    locationMarker.bindPopup(
      `<strong>Sua localização</strong><br>${coords.displayName}`
    );

    // Adiciona círculo para mostrar o raio de busca
    if (searchCircle) map.removeLayer(searchCircle);

    searchCircle = L.circle([coords.lat, coords.lng], {
      radius: radius * 1000,
      color: "#3b82f6",
      fillColor: "#60a5fa",
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(map);

    // Busca lojas dentro do raio
    const stores = await getNearbyStores(coords.lat, coords.lng, radius);

    // Cria botões de categoria e exibe resultados
    createCategoryButtons(stores);
    displayResults(stores);

    // Ajusta visualização do mapa para incluir todos os pontos
    if (stores && stores.elements && stores.elements.length > 0) {
      const bounds = L.latLngBounds([coords.lat, coords.lng]);

      stores.elements.forEach((store) => {
        const lat = store.lat || store.center.lat;
        const lng = store.lon || store.center.lon;
        bounds.extend([lat, lng]);
      });

      map.fitBounds(bounds, { padding: [50, 50] });
    }
  } catch (error) {
    showError(`Ocorreu um erro na busca: ${error.message}`);
  }
}

// Inicializa a aplicação quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", init);
