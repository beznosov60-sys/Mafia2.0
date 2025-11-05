<template>
  <div class="page">
    <header class="toolbar">
      <div class="toolbar__left">
        <h1 class="toolbar__title">Mafia CRM 2.0</h1>
        <p class="toolbar__subtitle">
          Клиентов: {{ clients.length }} · В работе: {{ activeClientsCount }} · Завершены: {{ completedClientsCount }} · Незавершённых задач: {{ pendingTasksCount }}
        </p>
        <p class="toolbar__subtitle" v-if="lastSyncedLabel">
          Последняя синхронизация: {{ lastSyncedLabel }}
        </p>
      </div>
      <div class="toolbar__actions">
        <button class="button" type="button" @click="refresh" :disabled="isLoading">
          {{ isLoading ? 'Загрузка…' : 'Обновить' }}
        </button>
        <button
          class="button"
          type="button"
          @click="clearLocalCache"
          :disabled="isLoading || clients.length === 0"
        >
          Очистить кеш
        </button>
        <button
          class="button"
          type="button"
          @click="handleSave"
          :disabled="isSaving || !isDirty"
        >
          {{ isSaving ? 'Сохранение…' : 'Синхронизировать' }}
        </button>
        <button class="button button--primary" type="button" @click="openCreateForm">
          Добавить клиента
        </button>
      </div>
    </header>

    <main class="layout">
      <aside class="sidebar">
        <div class="sidebar__header">
          <h2 class="sidebar__title">Клиенты</h2>
          <div class="search">
            <input v-model="searchTerm" type="search" placeholder="Поиск по имени, городу, менеджеру" />
          </div>
        </div>
        <div class="sidebar__body" v-if="!isLoading">
          <button
            v-for="client in filteredClients"
            :key="client.id"
            type="button"
            class="client-button"
            :class="{ 'client-button--active': client.id === selectedClientId }"
            @click="selectClient(client.id)"
          >
            <span class="client-button__name">{{ client.fullName || 'Без имени' }}</span>
            <span class="client-button__meta">
              <span class="badge" :class="`badge--${stageBadge(client.stage)}`">{{ client.stage }}</span>
              <span>{{ client.manager || 'Без менеджера' }}</span>
              <span v-if="client.city">{{ client.city }}</span>
            </span>
          </button>
          <p v-if="filteredClients.length === 0" class="empty-state">Нет клиентов</p>
        </div>
        <div v-else class="empty-state">Загрузка клиентов…</div>
      </aside>

      <section class="details" v-if="selectedClient">
        <header class="details__header">
          <h2 class="details__title">{{ selectedClient.fullName || 'Новый клиент' }}</h2>
          <div class="toolbar__actions">
            <span class="stage-indicator">
              <span class="stage-indicator__dot"></span>
              {{ selectedClient.stage }}
            </span>
            <button class="button button--ghost" type="button" @click="openEditForm(selectedClient)">
              Редактировать
            </button>
            <button class="button button--ghost button--danger" type="button" @click="confirmDelete(selectedClient)">
              Удалить
            </button>
          </div>
        </header>

        <div class="grid grid--two">
          <div class="field">
            <label for="stageSelect">Стадия</label>
            <select id="stageSelect" v-model="selectedClient.stage" @change="handleStageChange(selectedClient)">
              <option v-for="stage in stageOptions" :key="stage.id" :value="stage.name">{{ stage.name }}</option>
            </select>
          </div>
          <div class="field">
            <label for="subStageSelect">Подэтап</label>
            <select id="subStageSelect" v-model="selectedClient.subStage">
              <option v-for="sub in currentSubStages" :key="sub" :value="sub">{{ sub }}</option>
              <option value="" v-if="currentSubStages.length === 0">—</option>
            </select>
          </div>
          <div class="field">
            <label for="managerInput">Менеджер</label>
            <input id="managerInput" v-model="selectedClient.manager" type="text" placeholder="Имя менеджера" />
          </div>
          <div class="field">
            <label for="cityInput">Город</label>
            <input id="cityInput" v-model="selectedClient.city" type="text" placeholder="Город" />
          </div>
          <div class="field">
            <label for="phoneInput">Телефон</label>
            <input id="phoneInput" v-model="selectedClient.phone" type="tel" placeholder="Телефон" />
          </div>
          <div class="field">
            <label for="emailInput">Email</label>
            <input id="emailInput" v-model="selectedClient.email" type="email" placeholder="Email" />
          </div>
          <div class="field">
            <label for="courtDateInput">Дата суда</label>
            <input id="courtDateInput" v-model="selectedClient.courtDate" type="date" />
          </div>
          <div class="field">
            <label for="nextStepInput">Следующий шаг</label>
            <input id="nextStepInput" v-model="selectedClient.nextStep" type="text" placeholder="Что нужно сделать дальше" />
          </div>
        </div>

        <div class="field">
          <label for="notesInput">Заметки</label>
          <textarea id="notesInput" v-model="selectedClient.notes" placeholder="Свободные заметки по клиенту"></textarea>
        </div>

        <div class="grid grid--two">
          <section class="panel">
            <header class="details__header">
              <h3 class="panel__title">Задачи</h3>
              <span class="toolbar__subtitle">Выполнено {{ completedTasksCount }}/{{ selectedClient.tasks.length }}</span>
            </header>
            <div class="task-list" v-if="selectedClient.tasks.length">
              <div class="task-item" v-for="task in selectedClient.tasks" :key="task.id">
                <label class="task-item__text">
                  <input type="checkbox" v-model="task.done" />
                  <span :class="{ done: task.done }">{{ task.text }}</span>
                </label>
                <button class="button button--ghost" type="button" @click="removeTask(task.id)">Удалить</button>
              </div>
            </div>
            <p v-else class="empty-state">Список задач пуст</p>
            <form class="split" @submit.prevent="addTask">
              <div class="field">
                <label for="newTaskInput">Новая задача</label>
                <input id="newTaskInput" v-model="newTaskText" type="text" placeholder="Описание задачи" />
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <button class="button button--primary" type="submit" :disabled="!newTaskText.trim()">
                  Добавить
                </button>
              </div>
            </form>
          </section>

          <section class="panel">
            <header class="details__header">
              <h3 class="panel__title">Платежи</h3>
              <span class="toolbar__subtitle">Всего {{ formatCurrency(totalPayments) }}</span>
            </header>
            <div class="payment-list" v-if="selectedClient.payments.length">
              <div class="payment-item" v-for="payment in selectedClient.payments" :key="payment.id">
                <span class="payment-item__amount">{{ formatCurrency(payment.amount) }}</span>
                <span>
                  <strong>{{ formatDate(payment.date) }}</strong>
                  <br />
                  {{ payment.description || 'Без описания' }}
                </span>
                <button class="button button--ghost" type="button" @click="removePayment(payment.id)">×</button>
              </div>
            </div>
            <p v-else class="empty-state">Платежей ещё нет</p>
            <form class="grid" @submit.prevent="addPayment">
              <div class="field">
                <label for="paymentAmountInput">Сумма</label>
                <input id="paymentAmountInput" v-model.number="newPayment.amount" type="number" min="0" step="100" />
              </div>
              <div class="field">
                <label for="paymentDateInput">Дата</label>
                <input id="paymentDateInput" v-model="newPayment.date" type="date" />
              </div>
              <div class="field">
                <label for="paymentDescriptionInput">Описание</label>
                <input id="paymentDescriptionInput" v-model="newPayment.description" type="text" placeholder="Комментарий" />
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <button class="button button--primary" type="submit" :disabled="!newPayment.amount || !newPayment.date">
                  Добавить платёж
                </button>
              </div>
            </form>
          </section>
        </div>

        <section class="panel">
          <header class="details__header">
            <h3 class="panel__title">Обновления</h3>
          </header>
          <div class="update-list" v-if="selectedClient.updates.length">
            <div class="update-item" v-for="update in sortedUpdates" :key="update.id">
              <div>
                <strong>{{ formatDate(update.date) }}</strong>
                <p>{{ update.text }}</p>
              </div>
              <button class="button button--ghost" type="button" @click="removeUpdate(update.id)">Удалить</button>
            </div>
          </div>
          <p v-else class="empty-state">Ещё нет записей об обновлениях</p>
          <form class="grid" @submit.prevent="addUpdate">
            <div class="field">
              <label for="updateDateInput">Дата</label>
              <input id="updateDateInput" v-model="newUpdate.date" type="date" />
            </div>
            <div class="field" style="grid-column: span 2;">
              <label for="updateTextInput">Комментарий</label>
              <textarea id="updateTextInput" v-model="newUpdate.text" placeholder="Что произошло?" rows="3"></textarea>
            </div>
            <div class="field">
              <label>&nbsp;</label>
              <button class="button button--primary" type="submit" :disabled="!newUpdate.text.trim()">
                Добавить запись
              </button>
            </div>
          </form>
        </section>
      </section>

      <section class="details empty-state" v-else>
        Выберите клиента слева или создайте нового.
      </section>
    </main>

    <div v-if="showForm" class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal">
        <h2 class="modal__title">{{ formMode === 'create' ? 'Новый клиент' : 'Редактирование клиента' }}</h2>
        <form class="grid" @submit.prevent="submitClient">
          <div class="field">
            <label for="formFullName">ФИО</label>
            <input id="formFullName" v-model="draftClient.fullName" type="text" required />
          </div>
          <div class="field">
            <label for="formManager">Менеджер</label>
            <input id="formManager" v-model="draftClient.manager" type="text" />
          </div>
          <div class="field">
            <label for="formCity">Город</label>
            <input id="formCity" v-model="draftClient.city" type="text" />
          </div>
          <div class="field">
            <label for="formPhone">Телефон</label>
            <input id="formPhone" v-model="draftClient.phone" type="tel" />
          </div>
          <div class="field">
            <label for="formEmail">Email</label>
            <input id="formEmail" v-model="draftClient.email" type="email" />
          </div>
          <div class="field">
            <label for="formStage">Стадия</label>
            <select id="formStage" v-model="draftClient.stage" @change="handleStageChange(draftClient)">
              <option v-for="stage in stageOptions" :key="stage.id" :value="stage.name">{{ stage.name }}</option>
            </select>
          </div>
          <div class="field">
            <label for="formSubStage">Подэтап</label>
            <select id="formSubStage" v-model="draftClient.subStage">
              <option v-for="sub in getSubStagesFor(draftClient.stage)" :key="sub" :value="sub">{{ sub }}</option>
              <option value="" v-if="getSubStagesFor(draftClient.stage).length === 0">—</option>
            </select>
          </div>
          <div class="field" style="grid-column: span 2;">
            <label for="formNotes">Заметки</label>
            <textarea id="formNotes" v-model="draftClient.notes" rows="4"></textarea>
          </div>
        </form>
        <div class="modal__actions">
          <button class="button button--ghost" type="button" @click="closeForm">Отмена</button>
          <button class="button button--primary" type="button" @click="submitClient">Сохранить</button>
        </div>
      </div>
    </div>

    <div class="alerts">
      <div v-if="errorMessage" class="alert alert--error">{{ errorMessage }}</div>
      <div v-if="successMessage" class="alert alert--success">{{ successMessage }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { findStageByName, slugifyStage } from './constants/stages';
import { SAMPLE_CLIENTS } from './data/sampleClients';
import { fetchClientsFromApi, persistClients } from './services/clientService';
import {
  STORAGE_KEY,
  createEmptyClient,
  ensureClientShape,
  getStageOptions,
  readClientsFromStorage,
  saveClientsToStorage,
} from './utils/clients';
import { createId } from './utils/id';

const clients = ref([]);
const selectedClientId = ref('');
const searchTerm = ref('');
const isLoading = ref(true);
const isSaving = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const isDirty = ref(false);
const showForm = ref(false);
const formMode = ref('create');
const draftClient = ref(createEmptyClient());
const newTaskText = ref('');
const newPayment = reactive({ amount: 0, date: '', description: '' });
const newUpdate = reactive({ date: new Date().toISOString().slice(0, 10), text: '' });
const lastSyncedAt = ref(null);
const isHydrating = ref(true);

const stageOptions = getStageOptions();

const filteredClients = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) {
    return clients.value;
  }
  return clients.value.filter((client) => {
    const haystack = [client.fullName, client.manager, client.city, client.stage, client.subStage]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
});

const selectedClient = computed(() => {
  return clients.value.find((client) => client.id === selectedClientId.value) || null;
});

const currentSubStages = computed(() => {
  if (!selectedClient.value) return [];
  const stage = findStageByName(selectedClient.value.stage);
  return stage?.subStages || [];
});

const completedTasksCount = computed(() => {
  if (!selectedClient.value) return 0;
  return selectedClient.value.tasks.filter((task) => task.done).length;
});

const totalPayments = computed(() => {
  if (!selectedClient.value) return 0;
  return selectedClient.value.payments.reduce((acc, payment) => acc + (Number(payment.amount) || 0), 0);
});

const sortedUpdates = computed(() => {
  if (!selectedClient.value) return [];
  return [...selectedClient.value.updates].sort((a, b) => {
    return (b.date || '').localeCompare(a.date || '');
  });
});

const activeClientsCount = computed(() => clients.value.filter((client) => client.stage !== 'Завершение').length);
const completedClientsCount = computed(() => clients.value.filter((client) => client.stage === 'Завершение').length);
const pendingTasksCount = computed(() =>
  clients.value.reduce((acc, client) => acc + client.tasks.filter((task) => !task.done).length, 0),
);

const lastSyncedLabel = computed(() => {
  if (!lastSyncedAt.value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(lastSyncedAt.value);
});

watch(
  clients,
  (value) => {
    if (isHydrating.value) return;
    saveClientsToStorage(value);
    isDirty.value = true;
  },
  { deep: true },
);

watch(selectedClientId, () => {
  newTaskText.value = '';
  newPayment.amount = 0;
  newPayment.date = '';
  newPayment.description = '';
  newUpdate.date = new Date().toISOString().slice(0, 10);
  newUpdate.text = '';
});

function stageBadge(stageName) {
  return slugifyStage(stageName);
}

function selectClient(id) {
  selectedClientId.value = id;
}

function openCreateForm() {
  draftClient.value = createEmptyClient();
  formMode.value = 'create';
  showForm.value = true;
}

function openEditForm(client) {
  draftClient.value = ensureClientShape(client);
  formMode.value = 'edit';
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
}

function ensureSelection() {
  if (!selectedClientId.value && clients.value.length > 0) {
    selectedClientId.value = clients.value[0].id;
  }
}

function getSubStagesFor(stageName) {
  const stage = findStageByName(stageName);
  return stage?.subStages || [];
}

function handleStageChange(client) {
  const stage = findStageByName(client.stage);
  if (!stage) return;
  if (!stage.subStages.includes(client.subStage)) {
    client.subStage = stage.subStages[0] || '';
  }
}

function submitClient() {
  const prepared = ensureClientShape(draftClient.value);
  if (formMode.value === 'create') {
    clients.value = [prepared, ...clients.value];
    selectedClientId.value = prepared.id;
    showSuccess('Клиент успешно добавлен.');
  } else {
    const index = clients.value.findIndex((client) => client.id === prepared.id);
    if (index !== -1) {
      clients.value.splice(index, 1, prepared);
      selectedClientId.value = prepared.id;
      showSuccess('Изменения клиента сохранены.');
    }
  }
  showForm.value = false;
}

function removeTask(taskId) {
  if (!selectedClient.value) return;
  selectedClient.value.tasks = selectedClient.value.tasks.filter((task) => task.id !== taskId);
}

function addTask() {
  if (!selectedClient.value) return;
  const text = newTaskText.value.trim();
  if (!text) return;
  selectedClient.value.tasks.push({ id: createId('task'), text, done: false });
  newTaskText.value = '';
}

function removePayment(paymentId) {
  if (!selectedClient.value) return;
  selectedClient.value.payments = selectedClient.value.payments.filter((payment) => payment.id !== paymentId);
}

function addPayment() {
  if (!selectedClient.value) return;
  const amount = Number(newPayment.amount);
  if (!amount || !newPayment.date) return;
  selectedClient.value.payments.push({
    id: createId('payment'),
    amount,
    date: newPayment.date,
    description: newPayment.description,
  });
  newPayment.amount = 0;
  newPayment.date = '';
  newPayment.description = '';
}

function addUpdate() {
  if (!selectedClient.value) return;
  const text = newUpdate.text.trim();
  if (!text) return;
  selectedClient.value.updates.push({
    id: createId('update'),
    date: newUpdate.date || new Date().toISOString().slice(0, 10),
    text,
  });
  newUpdate.date = new Date().toISOString().slice(0, 10);
  newUpdate.text = '';
}

function removeUpdate(updateId) {
  if (!selectedClient.value) return;
  selectedClient.value.updates = selectedClient.value.updates.filter((update) => update.id !== updateId);
}

function confirmDelete(client) {
  if (!client) return;
  const confirmed = window.confirm(`Удалить клиента «${client.fullName}»?`);
  if (!confirmed) return;
  clients.value = clients.value.filter((item) => item.id !== client.id);
  if (selectedClientId.value === client.id) {
    selectedClientId.value = '';
  }
  ensureSelection();
  showSuccess('Клиент удалён.');
}

function formatCurrency(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(number);
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
  } catch (error) {
    return value;
  }
}

function clearLocalCache() {
  localStorage.removeItem(STORAGE_KEY);
  showSuccess('Локальный кеш очищен.');
}

async function refresh() {
  await loadClients();
}

async function handleSave() {
  isSaving.value = true;
  try {
    await persistClients(clients.value.map((client) => ensureClientShape(client)));
    isDirty.value = false;
    lastSyncedAt.value = new Date();
    showSuccess('Данные синхронизированы с сервером.');
  } catch (error) {
    console.error('Не удалось сохранить данные', error);
    showError(`Не удалось синхронизировать данные: ${error.message || error}`);
  } finally {
    isSaving.value = false;
  }
}

function showSuccess(message) {
  successMessage.value = message;
  setTimeout(() => {
    if (successMessage.value === message) {
      successMessage.value = '';
    }
  }, 4000);
}

function showError(message) {
  errorMessage.value = message;
  setTimeout(() => {
    if (errorMessage.value === message) {
      errorMessage.value = '';
    }
  }, 6000);
}

async function loadClients() {
  isLoading.value = true;
  errorMessage.value = '';
  let loadedClients = [];
  try {
    const remote = await fetchClientsFromApi();
    if (!Array.isArray(remote)) {
      throw new Error('Ответ сервера не является массивом.');
    }
    loadedClients = remote.map((client) => ensureClientShape(client));
    lastSyncedAt.value = new Date();
    showSuccess('Данные загружены с сервера.');
  } catch (error) {
    console.warn('Переходим на локальные данные', error);
    const cached = readClientsFromStorage();
    if (cached.length > 0) {
      loadedClients = cached;
      showError('Сервер недоступен. Показаны локально сохранённые данные.');
    } else {
      loadedClients = SAMPLE_CLIENTS.map((client) => ensureClientShape(client));
      showError('Сервер недоступен. Загружены демонстрационные данные.');
    }
  } finally {
    clients.value = loadedClients;
    ensureSelection();
    isDirty.value = false;
    await nextTick();
    isHydrating.value = false;
    isLoading.value = false;
  }
}

onMounted(() => {
  loadClients();
});
</script>
