// GET /api/config
import { config } from '../_lib/config.js';
import { json } from '../_lib/http.js';
import { isDemoMode } from '../_lib/payments.js';
import { localNow } from '../_lib/time.js';

export const onRequestGet = ({ env }) =>
  json({
    business: config.business,
    deposit: config.depositAmount,
    demoMode: isDemoMode(env),
    today: localNow().date,
    daysAhead: config.daysAhead,
    hours: config.hours,
    loyaltyStamps: config.loyaltyStamps,
    services: config.services.map(({ id, name, price, duration, short, description }) => ({
      id, name, price, duration, short, description,
    })),
  });
