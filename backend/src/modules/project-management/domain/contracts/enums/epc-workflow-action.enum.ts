/** Action-level permissions — replace coarse module RBAC for workflow mutations. */
export enum EpcWorkflowAction {
  ENGINEERING_DOCUMENT_VERSION_UPLOAD = 'engineering_document.version.upload',
  ENGINEERING_DOCUMENT_VERSION_LOCK = 'engineering_document.version.lock',
  REVIEW_COMMENT_ASSIGN = 'review.comment.assign',
  REVIEW_COMMENT_VERIFY = 'review.comment.verify',
  REVIEW_SESSION_APPROVE = 'review.session.approve',
  REVIEW_SESSION_BATCH_APPROVE = 'review.session.batch_approve',
  REVIEW_SESSION_BATCH_RETURN = 'review.session.batch_return',
  DESIGN_PACKAGE_SUBMIT = 'design_package.submit',
  SUBMITTAL_CREATE = 'submittal.create',
  SUBMITTAL_ISSUE = 'submittal.issue',
  REVISION_TRIGGER = 'revision.trigger',
}
