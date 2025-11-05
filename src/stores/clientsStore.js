import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import clientsSeed from '../data/clients.json';
import { STAGE_ORDER } from '../constants/stages';

const STORAGE_KEY = 'mafia-crm-clients';

function loadStoredClients() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Не удалось прочитать клиентов из localStorage', error);
  }
  return null;
}

function normalizeClient(client) {
  return {
    id: client.id,
    fullName: client.fullName || '',
    phone: client.phone || '',
    email: client.email || '',
    city: client.city || '',
    court: client.court || null,
    courtTypes: client.courtTypes || { arbitration: false, tret: false },
    stage: client.stage || STAGE_ORDER[0],
    subStage: client.subStage || '',
    manager: client.manager || { id: 'unknown', name: 'Не назначен', phone: '' },
    tasks: client.tasks || [],
    notes: client.notes || '',
    finances: client.finances || { contractAmount: 0, payments: [], expenses: [] },
    updates: client.updates || [],
    archived: Boolean(client.archived)
  };
}

function sumMoney(entries = []) {
  return entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
}

export const useClientsStore = defineStore('clients', () => {
  const initial = loadStoredClients() || clientsSeed.map(normalizeClient);
  const clients = ref(initial);
  const searchQuery = ref('');

  if (typeof window !== 'undefined') {
    watch(
      clients,
      newValue => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newValue));
      },
      { deep: true }
    );
  }

  const activeClients = computed(() => clients.value.filter(client => !client.archived));
  const archivedClients = computed(() => clients.value.filter(client => client.archived));

  const filteredClients = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) {
      return activeClients.value;
    }
    return activeClients.value.filter(client => {
      return [
        client.fullName,
        client.phone,
        client.email,
        client.city,
        client.manager?.name
      ]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(query));
    });
  });

  const stageSummary = computed(() => {
    return STAGE_ORDER.map(stage => ({
      stage,
      count: activeClients.value.filter(client => client.stage === stage).length
    }));
  });

  const totalFinance = computed(() => {
    const allPayments = clients.value.flatMap(client => client.finances?.payments || []);
    const allExpenses = clients.value.flatMap(client => client.finances?.expenses || []);
    const contracts = clients.value.reduce(
      (total, client) => total + Number(client.finances?.contractAmount || 0),
      0
    );
    const payments = sumMoney(allPayments);
    const expenses = sumMoney(allExpenses);
    return {
      contracts,
      payments,
      expenses,
      balance: payments - expenses
    };
  });

  const managers = computed(() => {
    const map = new Map();
    clients.value.forEach(client => {
      const manager = client.manager || { id: 'unknown', name: 'Не назначен', phone: '' };
      if (!map.has(manager.id)) {
        map.set(manager.id, {
          id: manager.id,
          name: manager.name,
          phone: manager.phone,
          activeClients: [],
          archivedClients: []
        });
      }
      const bucket = client.archived ? 'archivedClients' : 'activeClients';
      map.get(manager.id)[bucket].push(client);
    });

    return Array.from(map.values()).map(manager => ({
      ...manager,
      totalClients: manager.activeClients.length + manager.archivedClients.length,
      stageDistribution: STAGE_ORDER.map(stage => ({
        stage,
        count: manager.activeClients.filter(client => client.stage === stage).length
      }))
    }));
  });

  const courtsThisMonth = computed(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    return activeClients.value
      .filter(client => {
        if (!client.court?.date) {
          return false;
        }
        const date = new Date(client.court.date);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      })
      .map(client => ({
        id: client.id,
        fullName: client.fullName,
        date: client.court?.date,
        title: client.court?.title,
        manager: client.manager?.name || 'Не назначен',
        stage: client.stage
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  function setSearchQuery(query) {
    searchQuery.value = query;
  }

  function getClientById(id) {
    return clients.value.find(client => client.id === id);
  }

  function createClientId() {
    const base = `C-${Date.now()}`;
    if (!getClientById(base)) {
      return base;
    }
    return `C-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  function addClient(payload) {
    const newClient = normalizeClient({
      ...payload,
      id: payload.id || createClientId(),
      finances: {
        contractAmount: Number(payload.finances?.contractAmount || 0),
        payments: payload.finances?.payments || [],
        expenses: payload.finances?.expenses || []
      },
      updates: payload.updates || [
        {
          id: `u-${Date.now()}`,
          date: new Date().toISOString().slice(0, 10),
          text: 'Клиент добавлен в систему'
        }
      ]
    });
    clients.value = [...clients.value, newClient];
    return newClient.id;
  }

  function updateClient(id, updates) {
    clients.value = clients.value.map(client => {
      if (client.id !== id) {
        return client;
      }
      return normalizeClient({
        ...client,
        ...updates,
        id: id,
        finances: {
          contractAmount: Number(updates?.finances?.contractAmount ?? client.finances?.contractAmount ?? 0),
          payments: updates?.finances?.payments || client.finances?.payments || [],
          expenses: updates?.finances?.expenses || client.finances?.expenses || []
        }
      });
    });
  }

  function archiveClient(id) {
    updateClient(id, { archived: true });
  }

  function restoreClient(id) {
    updateClient(id, { archived: false });
  }

  function addUpdate(id, text) {
    clients.value = clients.value.map(client => {
      if (client.id !== id) {
        return client;
      }
      const entry = {
        id: `u-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        text
      };
      return {
        ...client,
        updates: [entry, ...(client.updates || [])]
      };
    });
  }

  return {
    clients,
    activeClients,
    archivedClients,
    filteredClients,
    stageSummary,
    totalFinance,
    managers,
    courtsThisMonth,
    searchQuery,
    setSearchQuery,
    getClientById,
    addClient,
    updateClient,
    archiveClient,
    restoreClient,
    addUpdate
  };
});
