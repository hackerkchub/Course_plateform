import { sendSuccess } from '../../utils/response.js';
import * as contentService from './course-content.service.js';

// SEO
export async function getCourseSeo(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const seo = await contentService.getCourseSeo(courseId);
    return sendSuccess(res, 'Course SEO fetched successfully', seo);
  } catch (error) {
    next(error);
  }
}

export async function updateCourseSeo(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const seo = await contentService.updateCourseSeo(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Course SEO updated successfully', seo);
  } catch (error) {
    next(error);
  }
}

// Pricing & Installments
export async function getCoursePricing(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const pricing = await contentService.getCoursePricing(courseId);
    return sendSuccess(res, 'Course pricing fetched successfully', pricing);
  } catch (error) {
    next(error);
  }
}

export async function updateCoursePricing(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const pricing = await contentService.updateCoursePricing(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Course pricing updated successfully', pricing);
  } catch (error) {
    next(error);
  }
}

export async function getInstallmentPlans(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const plans = await contentService.getInstallmentPlans(courseId);
    return sendSuccess(res, 'Installment plans fetched successfully', plans);
  } catch (error) {
    next(error);
  }
}

export async function createInstallmentPlan(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const plan = await contentService.createInstallmentPlan(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Installment plan created successfully', plan, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateInstallmentPlan(req, res, next) {
  try {
    const planId = Number(req.params.planId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const plan = await contentService.updateInstallmentPlan(planId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Installment plan updated successfully', plan);
  } catch (error) {
    next(error);
  }
}

export async function deleteInstallmentPlan(req, res, next) {
  try {
    const planId = Number(req.params.planId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await contentService.deleteInstallmentPlan(planId, actorId, ipAddress);
    return sendSuccess(res, 'Installment plan deleted successfully', result);
  } catch (error) {
    next(error);
  }
}

// Offers
export async function getCourseOffers(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const offers = await contentService.getCourseOffers(courseId);
    return sendSuccess(res, 'Course offers fetched successfully', offers);
  } catch (error) {
    next(error);
  }
}

export async function createOffer(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const offer = await contentService.createOffer(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Course offer created successfully', offer, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateOffer(req, res, next) {
  try {
    const offerId = Number(req.params.offerId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const offer = await contentService.updateOffer(offerId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Course offer updated successfully', offer);
  } catch (error) {
    next(error);
  }
}

export async function deleteOffer(req, res, next) {
  try {
    const offerId = Number(req.params.offerId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await contentService.deleteOffer(offerId, actorId, ipAddress);
    return sendSuccess(res, 'Course offer deleted successfully', result);
  } catch (error) {
    next(error);
  }
}

// FAQs
export async function getCourseFaqs(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const faqs = await contentService.getCourseFaqs(courseId);
    return sendSuccess(res, 'Course FAQs fetched successfully', faqs);
  } catch (error) {
    next(error);
  }
}

export async function replaceCourseFaqs(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const faqs = await contentService.replaceCourseFaqs(courseId, req.body.faqs, actorId, ipAddress);
    return sendSuccess(res, 'Course FAQs replaced successfully', faqs);
  } catch (error) {
    next(error);
  }
}

// Testimonials
export async function getCourseTestimonials(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const testimonials = await contentService.getCourseTestimonials(courseId);
    return sendSuccess(res, 'Course testimonials fetched successfully', testimonials);
  } catch (error) {
    next(error);
  }
}

export async function replaceCourseTestimonials(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const testimonials = await contentService.replaceCourseTestimonials(courseId, req.body.testimonials, actorId, ipAddress);
    return sendSuccess(res, 'Course testimonials replaced successfully', testimonials);
  } catch (error) {
    next(error);
  }
}

// Benefits
export async function getCourseBenefits(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const benefits = await contentService.getCourseBenefits(courseId);
    return sendSuccess(res, 'Course benefits fetched successfully', benefits);
  } catch (error) {
    next(error);
  }
}

export async function updateCourseBenefits(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const benefits = await contentService.updateCourseBenefits(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Course benefits updated successfully', benefits);
  } catch (error) {
    next(error);
  }
}

// Enrollment Settings
export async function getCourseEnrollmentSettings(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const settings = await contentService.getCourseEnrollmentSettings(courseId);
    return sendSuccess(res, 'Course enrollment settings fetched successfully', settings);
  } catch (error) {
    next(error);
  }
}

export async function updateCourseEnrollmentSettings(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const settings = await contentService.updateCourseEnrollmentSettings(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Course enrollment settings updated successfully', settings);
  } catch (error) {
    next(error);
  }
}

// Points
export async function getCoursePoints(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const points = await contentService.getCoursePoints(courseId);
    return sendSuccess(res, 'Course points fetched successfully', points);
  } catch (error) {
    next(error);
  }
}

export async function replaceCoursePoints(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const points = await contentService.replaceCoursePoints(courseId, req.body.points, actorId, ipAddress);
    return sendSuccess(res, 'Course points replaced successfully', points);
  } catch (error) {
    next(error);
  }
}
