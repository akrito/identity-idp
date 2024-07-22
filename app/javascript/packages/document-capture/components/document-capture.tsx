import { useState, useMemo, useContext, useEffect } from 'react';
import { Alert } from '@18f/identity-components';
import { useI18n } from '@18f/identity-react-i18n';
import { FormSteps, PromptOnNavigate } from '@18f/identity-form-steps';
import { VerifyFlowStepIndicator, VerifyFlowPath } from '@18f/identity-verify-flow';
import { useDidUpdateEffect } from '@18f/identity-react-hooks';
import type { FormStep } from '@18f/identity-form-steps';
import { getConfigValue } from '@18f/identity-config';
import { UploadFormEntriesError } from '../services/upload';
import DocumentsStep from './documents-step';
import InPersonPrepareStep from './in-person-prepare-step';
import InPersonLocationPostOfficeSearchStep from './in-person-location-post-office-search-step';
import InPersonLocationFullAddressEntryPostOfficeSearchStep from './in-person-location-full-address-entry-post-office-search-step';
import InPersonSwitchBackStep from './in-person-switch-back-step';
import ReviewIssuesStep from './review-issues-step';
import UploadContext from '../context/upload';
import AnalyticsContext from '../context/analytics';
import Submission from './submission';
import SubmissionStatus from './submission-status';
import { RetrySubmissionError } from './submission-complete';
import SuspenseErrorBoundary from './suspense-error-boundary';
import SubmissionInterstitial from './submission-interstitial';
import withProps from '../higher-order/with-props';
import { InPersonContext } from '../context';

interface DocumentCaptureProps {
  /**
   * Callback triggered on step change.
   */
  onStepChange?: () => void;
}

function DocumentCapture({ onStepChange = () => {} }: DocumentCaptureProps) {
  const [formValues, setFormValues] = useState<Record<string, any> | null>(null);
  const [submissionError, setSubmissionError] = useState<Error | undefined>(undefined);
  const [stepName, setStepName] = useState<string | undefined>(undefined);
  const { t } = useI18n();
  const { flowPath } = useContext(UploadContext);
  const { trackSubmitEvent, trackVisitEvent } = useContext(AnalyticsContext);
  const { inPersonFullAddressEntryEnabled, inPersonURL, skipDocAuth, skipDocAuthFromHandoff } =
    useContext(InPersonContext);
  useDidUpdateEffect(onStepChange, [stepName]);
  useEffect(() => {
    if (stepName) {
      trackVisitEvent(stepName);
    }
  }, [stepName]);
  const appName = getConfigValue('appName');
  const inPersonLocationPostOfficeSearchForm = inPersonFullAddressEntryEnabled
    ? InPersonLocationFullAddressEntryPostOfficeSearchStep
    : InPersonLocationPostOfficeSearchStep;

  // Define different states to be used in human readable array declaration
  const documentFormStep: FormStep = {
    name: 'documents',
    form: DocumentsStep,
    title: t('doc_auth.headings.document_capture'),
  };
  const reviewFormStep: FormStep = {
    name: 'review',
    form:
      submissionError instanceof UploadFormEntriesError
        ? withProps({
            remainingSubmitAttempts: submissionError.remainingSubmitAttempts,
            isResultCodeInvalid: submissionError.isResultCodeInvalid,
            isFailedResult: submissionError.isFailedResult,
            isFailedDocType: submissionError.isFailedDocType,
            isFailedSelfie: submissionError.isFailedSelfie,
            isFailedSelfieLivenessOrQuality:
              submissionError.selfieNotLive || submissionError.selfieNotGoodQuality,
            captureHints: submissionError.hints,
            pii: submissionError.pii,
            failedImageFingerprints: submissionError.failed_image_fingerprints,
          })(ReviewIssuesStep)
        : ReviewIssuesStep,
    title: t('doc_auth.errors.rate_limited_heading'),
  };

  // In Person Steps
  const prepareFormStep: FormStep = {
    name: 'prepare',
    form: InPersonPrepareStep,
    title: t('in_person_proofing.headings.prepare'),
  };
  const locationFormStep: FormStep = {
    name: 'location',
    form: inPersonLocationPostOfficeSearchForm,
    title: t('in_person_proofing.headings.po_search.location'),
  };
  const hybridFormStep: FormStep = {
    name: 'switch_back',
    form: InPersonSwitchBackStep,
    title: t('in_person_proofing.headings.switch_back'),
  };

  /**
   * Clears error state and sets form values for submission.
   *
   * @param nextFormValues Submitted form values.
   */
  function submitForm(nextFormValues: Record<string, any>) {
    setSubmissionError(undefined);
    setFormValues(nextFormValues);
  }

  const submissionFormValues = useMemo(
    () =>
      formValues && {
        ...formValues,
        flow_path: flowPath,
      },
    [formValues, flowPath],
  );

  let initialActiveErrors;
  if (submissionError instanceof UploadFormEntriesError) {
    initialActiveErrors = submissionError.formEntryErrors.map((error) => ({
      field: error.field,
      error,
    }));
  }

  let initialValues;
  if (submissionError && formValues) {
    initialValues = formValues;
  }

  const inPersonSteps: FormStep[] =
    inPersonURL === undefined
      ? []
      : ([prepareFormStep, locationFormStep, flowPath === 'hybrid' && hybridFormStep].filter(
          Boolean,
        ) as FormStep[]);

  const defaultSteps: FormStep[] = submissionError
    ? ([reviewFormStep] as FormStep[]).concat(inPersonSteps)
    : ([documentFormStep] as FormStep[]);

  // If the user got here by opting-in to in-person proofing, when skipDocAuth === true,
  // then set steps to inPersonSteps
  const isInPersonStepEnabled = skipDocAuth || skipDocAuthFromHandoff;
  const steps: FormStep[] = isInPersonStepEnabled ? inPersonSteps : defaultSteps;

  // If the user got here by opting-in to in-person proofing, when skipDocAuth === true;
  // or opting-in ipp from handoff page, and selfie is required, when skipDocAuthFromHandoff === true
  // then set stepIndicatorPath to VerifyFlowPath.IN_PERSON
  const stepIndicatorPath =
    (stepName && ['location', 'prepare', 'switch_back'].includes(stepName)) || isInPersonStepEnabled
      ? VerifyFlowPath.IN_PERSON
      : VerifyFlowPath.DEFAULT;

  return (
    <>
      <VerifyFlowStepIndicator currentStep="document_capture" path={stepIndicatorPath} />
      {submissionFormValues &&
      (!submissionError || submissionError instanceof RetrySubmissionError) ? (
        <>
          <SubmissionInterstitial autoFocus />
          <SuspenseErrorBoundary
            fallback={<PromptOnNavigate />}
            onError={setSubmissionError}
            handledError={submissionError}
          >
            {submissionError instanceof RetrySubmissionError ? (
              <SubmissionStatus />
            ) : (
              <Submission payload={submissionFormValues} />
            )}
          </SuspenseErrorBoundary>
        </>
      ) : (
        <>
          {submissionError && !(submissionError instanceof UploadFormEntriesError) && (
            <Alert type="error" className="margin-bottom-4">
              {t('doc_auth.errors.general.network_error')}
            </Alert>
          )}
          <FormSteps
            steps={steps}
            initialValues={initialValues}
            initialActiveErrors={initialActiveErrors}
            onComplete={submitForm}
            onStepChange={setStepName}
            onStepSubmit={trackSubmitEvent}
            autoFocus={!!submissionError}
            titleFormat={`%{step} - ${appName}`}
            initialStep={isInPersonStepEnabled ? steps[0].name : undefined}
          />
        </>
      )}
    </>
  );
}

export default DocumentCapture;
