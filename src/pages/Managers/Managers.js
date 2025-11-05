import { computed } from 'vue';
import { useClientsStore } from '../../stores/clientsStore';
import { STAGE_COLORS } from '../../constants/stages';

export default {
  name: 'ManagersPage',
  setup() {
    const clientsStore = useClientsStore();

    const managers = computed(() => {
      return clientsStore.managers.map(manager => {
        const activeCount = manager.activeClients.length;
        const archivedCount = manager.archivedClients.length;
        const total = manager.totalClients;
        const stageSummary = manager.stageDistribution.map(item => ({
          ...item,
          color: STAGE_COLORS[item.stage] || '#6366f1'
        }));
        return {
          ...manager,
          activeCount,
          archivedCount,
          total,
          stageSummary
        };
      });
    });

    const totals = computed(() => {
      const totalManagers = managers.value.length;
      const activeClients = managers.value.reduce((sum, manager) => sum + manager.activeCount, 0);
      const archivedClients = managers.value.reduce((sum, manager) => sum + manager.archivedCount, 0);
      return {
        totalManagers,
        activeClients,
        archivedClients,
        totalClients: activeClients + archivedClients
      };
    });

    return {
      managers,
      totals
    };
  }
};
