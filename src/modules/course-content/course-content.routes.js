import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './course-content.controller.js';
import {
  updateSeoSchema,
  updatePricingSchema,
  createInstallmentPlanSchema,
  updateInstallmentPlanSchema,
  createOfferSchema,
  updateOfferSchema,
  updateFaqsSchema,
  updateTestimonialsSchema,
  updateBenefitsSchema,
  updateEnrollmentSettingsSchema,
  updatePointsSchema,
} from './course-content.validation.js';

const courseContentAdminRoutes = Router({ mergeParams: true });
courseContentAdminRoutes.use(authenticate, authorize('admin', 'super_admin'));

// SEO
courseContentAdminRoutes.get('/:id/seo', controller.getCourseSeo);
courseContentAdminRoutes.put('/:id/seo', validateBody(updateSeoSchema), controller.updateCourseSeo);

// Pricing
courseContentAdminRoutes.get('/:id/pricing', controller.getCoursePricing);
courseContentAdminRoutes.put('/:id/pricing', validateBody(updatePricingSchema), controller.updateCoursePricing);

// Installments
courseContentAdminRoutes.get('/:id/installments', controller.getInstallmentPlans);
courseContentAdminRoutes.post('/:id/installments', validateBody(createInstallmentPlanSchema), controller.createInstallmentPlan);
courseContentAdminRoutes.patch('/:id/installments/:planId', validateBody(updateInstallmentPlanSchema), controller.updateInstallmentPlan);
courseContentAdminRoutes.delete('/:id/installments/:planId', controller.deleteInstallmentPlan);

// Offers
courseContentAdminRoutes.get('/:id/offers', controller.getCourseOffers);
courseContentAdminRoutes.post('/:id/offers', validateBody(createOfferSchema), controller.createOffer);
courseContentAdminRoutes.patch('/:id/offers/:offerId', validateBody(updateOfferSchema), controller.updateOffer);
courseContentAdminRoutes.delete('/:id/offers/:offerId', controller.deleteOffer);

// FAQs
courseContentAdminRoutes.get('/:id/faqs', controller.getCourseFaqs);
courseContentAdminRoutes.put('/:id/faqs', validateBody(updateFaqsSchema), controller.replaceCourseFaqs);

// Testimonials
courseContentAdminRoutes.get('/:id/testimonials', controller.getCourseTestimonials);
courseContentAdminRoutes.put('/:id/testimonials', validateBody(updateTestimonialsSchema), controller.replaceCourseTestimonials);

// Benefits
courseContentAdminRoutes.get('/:id/benefits', controller.getCourseBenefits);
courseContentAdminRoutes.put('/:id/benefits', validateBody(updateBenefitsSchema), controller.updateCourseBenefits);

// Enrollment Settings
courseContentAdminRoutes.get('/:id/enrollment-settings', controller.getCourseEnrollmentSettings);
courseContentAdminRoutes.put('/:id/enrollment-settings', validateBody(updateEnrollmentSettingsSchema), controller.updateCourseEnrollmentSettings);

// Points
courseContentAdminRoutes.get('/:id/points', controller.getCoursePoints);
courseContentAdminRoutes.put('/:id/points', validateBody(updatePointsSchema), controller.replaceCoursePoints);

export { courseContentAdminRoutes };
