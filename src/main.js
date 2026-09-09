// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the Sarafan application

import { createApp } from 'vue'
import '@fortawesome/fontawesome-free/css/fontawesome.css'
import '@fortawesome/fontawesome-free/css/regular.css'
import '@fortawesome/fontawesome-free/css/solid.css'
import 'vuetify/styles'

import App from './App.vue'
import { router } from './router.js'
import { installErrorBoundaries } from './observability/boundaries.js'
import { EVENTS } from './observability/catalogue.js'
import { uiLogger } from './observability/logger.js'
import { createSarafanVuetify } from './plugins/vuetify.js'
import './styles.css'

const app = createApp(App)
installErrorBoundaries(app)
uiLogger.log(EVENTS.applicationStarted)
app.use(router).use(createSarafanVuetify()).mount('#app')
