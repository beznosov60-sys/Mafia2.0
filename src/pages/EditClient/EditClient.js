import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useClientsStore } from '../../stores/clientsStore';
import { STAGE_ORDER, SUB_STAGES } from '../../constants/stages';

export default {
  name: 'EditClientPage',
  setup() {
    const route = useRoute();
    const router = useRouter();
    const clientsStore = useClientsStore();
    const clientId = computed(() => String(route.params.id || ''));
    const errors = ref([]);
    const newUpdate = ref('');

    const originalClient = computed(() => clientsStore.getClientById(clientId.value));

    if (!originalClient.value) {
      router.replace({ name: 'home' });
    }

    const form = reactive({
      fullName: '',
      phone: '',
      email: '',
      city: '',
      stage: STAGE_ORDER[0],
      subStage: SUB_STAGES[STAGE_ORDER[0]][0],
      managerName: '',
      managerPhone: '',
      courtDate: '',
      courtTitle: '',
      courtTypeArbitration: false,
      courtTypeTret: false,
      contractAmount: '',
      notes: ''
    });

    watch(
      originalClient,
      value => {
        if (!value) {
          return;
        }
        form.fullName = value.fullName;
        form.phone = value.phone;
        form.email = value.email;
        form.city = value.city;
        form.stage = value.stage;
        form.subStage = value.subStage;
        form.managerName = value.manager?.name || '';
        form.managerPhone = value.manager?.phone || '';
        form.courtDate = value.court?.date || '';
        form.courtTitle = value.court?.title || '';
        form.courtTypeArbitration = Boolean(value.courtTypes?.arbitration);
        form.courtTypeTret = Boolean(value.courtTypes?.tret);
        form.contractAmount = value.finances?.contractAmount ?? '';
        form.notes = value.notes || '';
      },
      { immediate: true }
    );

    const subStages = computed(() => SUB_STAGES[form.stage] || []);

    watch(
      () => form.stage,
      () => {
        if (!subStages.value.includes(form.subStage)) {
          form.subStage = subStages.value[0] || '';
        }
      }
    );

    const updates = computed(() => originalClient.value?.updates || []);
    const isArchived = computed(() => Boolean(originalClient.value?.archived));

    function validate() {
      const validationErrors = [];
      if (!form.fullName.trim()) {
        validationErrors.push('Укажите имя и фамилию клиента.');
      }
      if (!form.stage) {
        validationErrors.push('Выберите стадию.');
      }
      return validationErrors;
    }

    function handleSubmit() {
      errors.value = validate();
      if (errors.value.length || !originalClient.value) {
        return;
      }

      const managerName = form.managerName.trim();
      const managerPhone = form.managerPhone.trim();
      const managerId = managerName ? originalClient.value.manager?.id || `M-${Date.now()}` : 'unknown';

      clientsStore.updateClient(clientId.value, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        city: form.city.trim(),
        stage: form.stage,
        subStage: form.subStage,
        manager: managerName
          ? {
              id: managerId,
              name: managerName,
              phone: managerPhone
            }
          : undefined,
        court:
          form.courtDate || form.courtTitle
            ? {
                date: form.courtDate || null,
                title: form.courtTitle || '',
                type: [
                  form.courtTypeArbitration ? 'АС' : null,
                  form.courtTypeTret ? 'ТС' : null
                ]
                  .filter(Boolean)
                  .join('/') || null
              }
            : null,
        courtTypes: {
          arbitration: form.courtTypeArbitration,
          tret: form.courtTypeTret
        },
        finances: {
          contractAmount: form.contractAmount ? Number(form.contractAmount) : 0,
          payments: originalClient.value.finances?.payments || [],
          expenses: originalClient.value.finances?.expenses || []
        },
        notes: form.notes.trim()
      });

      clientsStore.addUpdate(clientId.value, 'Карточка клиента обновлена.');
      router.push({ name: 'client-card', params: { id: clientId.value } });
    }

    function toggleArchive() {
      if (!originalClient.value) {
        return;
      }
      if (originalClient.value.archived) {
        clientsStore.restoreClient(clientId.value);
      } else {
        clientsStore.archiveClient(clientId.value);
      }
    }

    function addUpdateNote() {
      const text = newUpdate.value.trim();
      if (!text) {
        return;
      }
      clientsStore.addUpdate(clientId.value, text);
      newUpdate.value = '';
    }

    function openCard() {
      router.push({ name: 'client-card', params: { id: clientId.value } });
    }

    return {
      form,
      errors,
      updates,
      newUpdate,
      isArchived,
      stages: STAGE_ORDER,
      subStages,
      handleSubmit,
      toggleArchive,
      addUpdateNote,
      openCard
    };
  }
};
