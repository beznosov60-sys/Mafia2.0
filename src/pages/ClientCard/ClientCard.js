import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useClientsStore } from '../../stores/clientsStore';
import { STAGE_COLORS, STAGE_ORDER, SUB_STAGES } from '../../constants/stages';

const currencyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0
});

function sumMoney(entries = []) {
  return entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
}

export default {
  name: 'ClientCardPage',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const clientsStore = useClientsStore();
    const clientId = computed(() => String(route.params.id || ''));
    const client = computed(() => clientsStore.getClientById(clientId.value));

    if (!client.value) {
      router.replace({ name: 'home' });
    }

    const stageIndex = computed(() => {
      const index = STAGE_ORDER.indexOf(client.value?.stage ?? '');
      return index === -1 ? 0 : index;
    });

    const stages = computed(() =>
      STAGE_ORDER.map((stage, index) => ({
        stage,
        color: STAGE_COLORS[stage] || '#94a3b8',
        status: index < stageIndex.value ? 'done' : index === stageIndex.value ? 'current' : 'todo'
      }))
    );

    const subStageList = computed(() => SUB_STAGES[client.value?.stage || ''] || []);
    const payments = computed(() => client.value?.finances?.payments || []);
    const expenses = computed(() => client.value?.finances?.expenses || []);
    const paymentsTotal = computed(() => sumMoney(payments.value));
    const expensesTotal = computed(() => sumMoney(expenses.value));
    const contractAmount = computed(() => Number(client.value?.finances?.contractAmount || 0));
    const balance = computed(() => paymentsTotal.value - expensesTotal.value);

    const courtBadge = computed(() => {
      const types = client.value?.courtTypes || {};
      if (types.arbitration && types.tret) {
        return 'АС/ТС';
      }
      if (types.arbitration) {
        return 'АС';
      }
      if (types.tret) {
        return 'ТС';
      }
      return '';
    });

    const formattedPaymentsTotal = computed(() => currencyFormatter.format(paymentsTotal.value));
    const formattedExpensesTotal = computed(() => currencyFormatter.format(expensesTotal.value));
    const formattedBalance = computed(() => currencyFormatter.format(balance.value));
    const formattedContractAmount = computed(() => currencyFormatter.format(contractAmount.value));

    const updates = computed(() => client.value?.updates || []);
    const tasks = computed(() => client.value?.tasks || []);
    const isArchived = computed(() => Boolean(client.value?.archived));

    function goToEdit() {
      router.push({ name: 'edit-client', params: { id: clientId.value } });
    }

    function toggleArchive() {
      if (!client.value) {
        return;
      }
      if (client.value.archived) {
        clientsStore.restoreClient(clientId.value);
      } else {
        clientsStore.archiveClient(clientId.value);
      }
    }

    function stageColor(stage) {
      return STAGE_COLORS[stage] || '#94a3b8';
    }

    function formatMoney(value) {
      return currencyFormatter.format(Number(value || 0));
    }

    return {
      client,
      stages,
      subStageList,
      payments,
      expenses,
      paymentsTotal,
      expensesTotal,
      contractAmount,
      balance,
      formattedPaymentsTotal,
      formattedExpensesTotal,
      formattedBalance,
      formattedContractAmount,
      updates,
      tasks,
      isArchived,
      courtBadge,
      goToEdit,
      toggleArchive,
      stageColor,
      formatMoney
    };
  }
};
