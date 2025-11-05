import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useClientsStore } from '../../stores/clientsStore';
import { STAGE_COLORS } from '../../constants/stages';

export default {
  name: 'HomePage',
  setup() {
    const router = useRouter();
    const clientsStore = useClientsStore();
    const query = ref(clientsStore.searchQuery);

    watch(
      () => clientsStore.searchQuery,
      value => {
        if (value !== query.value) {
          query.value = value;
        }
      }
    );

    watch(query, value => {
      clientsStore.setSearchQuery(value);
    });

    const clients = computed(() => clientsStore.filteredClients);
    const stageSummary = computed(() => clientsStore.stageSummary);
    const courtsThisMonth = computed(() => clientsStore.courtsThisMonth);
    const archivedClients = computed(() => clientsStore.archivedClients);
    const latestUpdates = computed(() => {
      return clientsStore.clients
        .flatMap(client =>
          (client.updates || []).map(update => ({
            ...update,
            clientId: client.id,
            clientName: client.fullName
          }))
        )
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 6);
    });

    function openClient(id) {
      router.push({ name: 'client-card', params: { id } });
    }

    function editClient(id) {
      router.push({ name: 'edit-client', params: { id } });
    }

    function createClient() {
      router.push({ name: 'add-client' });
    }

    function stageColor(stage) {
      return STAGE_COLORS[stage] || '#94a3b8';
    }

    return {
      query,
      clients,
      stageSummary,
      courtsThisMonth,
      archivedClients,
      latestUpdates,
      openClient,
      editClient,
      createClient,
      stageColor
    };
  }
};
