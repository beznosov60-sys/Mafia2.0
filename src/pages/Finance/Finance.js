import { computed } from 'vue';
import { useClientsStore } from '../../stores/clientsStore';
import { STAGE_COLORS, STAGE_ORDER } from '../../constants/stages';

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

function sumMoney(entries = []) {
  return entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
}

export default {
  name: 'FinancePage',
  setup() {
    const clientsStore = useClientsStore();

    const summary = computed(() => clientsStore.totalFinance);

    const stageBreakdown = computed(() => {
      return STAGE_ORDER.map(stage => {
        const clients = clientsStore.clients.filter(client => client.stage === stage && !client.archived);
        const payments = clients.reduce((total, client) => total + sumMoney(client.finances?.payments || []), 0);
        const expenses = clients.reduce((total, client) => total + sumMoney(client.finances?.expenses || []), 0);
        const contracts = clients.reduce((total, client) => total + Number(client.finances?.contractAmount || 0), 0);
        return {
          stage,
          color: STAGE_COLORS[stage] || '#4f46e5',
          payments,
          expenses,
          contracts,
          balance: payments - expenses,
          clientsCount: clients.length
        };
      });
    });

    const clientsFinance = computed(() => {
      return clientsStore.clients.map(client => {
        const payments = sumMoney(client.finances?.payments || []);
        const expenses = sumMoney(client.finances?.expenses || []);
        return {
          id: client.id,
          fullName: client.fullName,
          manager: client.manager?.name || 'Не назначен',
          stage: client.stage,
          contracts: Number(client.finances?.contractAmount || 0),
          payments,
          expenses,
          balance: payments - expenses,
          archived: client.archived
        };
      });
    });

    function formatMoney(value) {
      return currencyFormatter.format(Number(value || 0));
    }

    return {
      summary,
      stageBreakdown,
      clientsFinance,
      formatMoney
    };
  }
};
