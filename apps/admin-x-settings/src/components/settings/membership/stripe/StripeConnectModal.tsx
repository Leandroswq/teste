import BookmarkThumb from '../../../../assets/images/stripe-thumb.jpg';
import Button from '../../../../admin-x-ds/global/Button';
import ConfirmationModal from '../../../../admin-x-ds/global/modal/ConfirmationModal';
import Form from '../../../../admin-x-ds/global/form/Form';
import GhostLogo from '../../../../assets/images/orb-squircle.png';
import GhostLogoPink from '../../../../assets/images/orb-pink.png';
import Heading from '../../../../admin-x-ds/global/Heading';
import Modal from '../../../../admin-x-ds/global/modal/Modal';
import NiceModal, {useModal} from '@ebay/nice-modal-react';
import React, {useState} from 'react';
import StripeButton from '../../../../admin-x-ds/settings/StripeButton';
import StripeLogo from '../../../../assets/images/stripe-emblem.svg';
import TextArea from '../../../../admin-x-ds/global/form/TextArea';
import TextField from '../../../../admin-x-ds/global/form/TextField';
import Toggle from '../../../../admin-x-ds/global/form/Toggle';
import useRouting from '../../../../hooks/useRouting';
import useSettingGroup from '../../../../hooks/useSettingGroup';
import useSettings from '../../../../hooks/useSettings';
import {ApiError} from '../../../../utils/apiRequests';
import {ReactComponent as StripeVerified} from '../../../../assets/images/stripe-verified.svg';
import {checkStripeEnabled, getGhostPaths, getSettingValue, getSettingValues} from '../../../../utils/helpers';
import {showToast} from '../../../../admin-x-ds/global/Toast';
import {toast} from 'react-hot-toast';
import {useBrowseMembers} from '../../../../utils/api/members';
import {useBrowseTiers, useEditTier} from '../../../../utils/api/tiers';
import {useDeleteStripeSettings, useEditSettings} from '../../../../utils/api/settings';
import {useGlobalData} from '../../../providers/DataProvider';

const RETRY_PRODUCT_SAVE_POLL_LENGTH = 1000;
const RETRY_PRODUCT_SAVE_MAX_POLL = 15 * RETRY_PRODUCT_SAVE_POLL_LENGTH;

const Start: React.FC<{onNext?: () => void}> = ({onNext}) => {
    return (
        <div>
            <div className='flex items-center justify-between'>
                <Heading level={3}>Getting paid</Heading>
                <StripeVerified />
            </div>
            <div className='mb-7 mt-6'>
                Stripe is our exclusive direct payments partner. Ghost collects <strong>no fees</strong> on any payments! If you don’t have a Stripe account yet, you can <a className='underline' href="https://stripe.com" rel="noopener noreferrer" target="_blank">sign up here</a>.
            </div>
            <StripeButton label={<>I have a Stripe account, let&apos;s go &rarr;</>} onClick={onNext} />
        </div>
    );
};

const Connect: React.FC = () => {
    const [submitEnabled, setSubmitEnabled] = useState(false);
    const [token, setToken] = useState('');
    const [testMode, setTestMode] = useState(false);
    const [error, setError] = useState('');

    const {refetch: fetchActiveTiers} = useBrowseTiers({
        searchParams: {filter: 'type:paid+active:true'},
        enabled: false
    });
    const {mutateAsync: editTier} = useEditTier();
    const {mutateAsync: editSettings} = useEditSettings();

    const onTokenChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setToken(event.target.value);
        setSubmitEnabled(Boolean(event.target.value));
    };

    const saveTier = async () => {
        const {data} = await fetchActiveTiers();
        const tier = data?.tiers[0];

        if (tier) {
            tier.monthly_price = 500;
            tier.yearly_price = 5000;
            tier.currency = 'USD';

            let pollTimeout = 0;
            /** To allow Stripe config to be ready in backend, we poll the save tier request */
            while (pollTimeout < RETRY_PRODUCT_SAVE_MAX_POLL) {
                await new Promise((resolve) => {
                    setTimeout(resolve, RETRY_PRODUCT_SAVE_POLL_LENGTH);
                });

                try {
                    await editTier(tier);
                    break;
                } catch (e) {
                    if (e instanceof ApiError && e.data?.errors?.[0].code === 'STRIPE_NOT_CONFIGURED') {
                        pollTimeout += RETRY_PRODUCT_SAVE_POLL_LENGTH;
                        // no-op: will try saving again as stripe is not ready
                        continue;
                    } else {
                        throw e;
                    }
                }
            }
        }
    };

    const onSubmit = async () => {
        setError('');

        if (token) {
            try {
                await editSettings([
                    {key: 'stripe_connect_integration_token', value: token}
                ]);

                await saveTier();

                await editSettings([
                    {key: 'portal_plans', value: JSON.stringify(['free', 'monthly', 'yearly'])}
                ]);
            } catch (e) {
                if (e instanceof ApiError && e.data?.errors) {
                    setError('Invalid secure key');
                    return;
                }
                throw error;
            }
        } else {
            setError('Please enter a secure key');
        }
    };

    const {apiRoot} = getGhostPaths();
    const stripeConnectUrl = `${apiRoot}/members/stripe_connect?mode=${testMode ? 'test' : 'live'}`;

    return (
        <div>
            <div className='mb-6 flex items-center justify-between'>
                <Heading level={3}>Connect with Stripe</Heading>
                <Toggle
                    direction='rtl'
                    label='Test mode'
                    labelClasses={`text-sm translate-y-[1px] ${testMode ? 'text-[#EC6803]' : 'text-grey-800'}`}
                    toggleBg='stripetest'
                    onChange={e => setTestMode(e.target.checked)}
                />
            </div>
            <Heading level={6} grey>Step 1 — <span className='text-black'>Generate secure key</span></Heading>
            <div className='mb-4 mt-2'>
                Click on the <strong>“Connect with Stripe”</strong> button to generate a secure key that connects your Ghost site with Stripe.
            </div>
            <StripeButton href={stripeConnectUrl} tag='a' target='_blank' />
            <Heading className='mb-2 mt-8' level={6} grey>Step 2 — <span className='text-black'>Paste secure key</span></Heading>
            <TextArea clearBg={false} error={Boolean(error)} hint={error || undefined} placeholder='Paste your secure key here' onChange={onTokenChange}></TextArea>
            {submitEnabled && <Button className='mt-5' color='green' label='Save Stripe settings' onClick={onSubmit} />}
        </div>
    );
};

const Connected: React.FC<{onClose?: () => void}> = ({onClose}) => {
    const {settings} = useSettings();
    const [stripeConnectAccountName, stripeConnectLivemode] = getSettingValues(settings, ['stripe_connect_account_name', 'stripe_connect_livemode']);

    const {refetch: fetchMembers, isFetching: isFetchingMembers} = useBrowseMembers({
        searchParams: {filter: 'status:paid', limit: '0'},
        enabled: false
    });

    const {mutateAsync: deleteStripeSettings} = useDeleteStripeSettings();

    const openDisconnectStripeModal = async () => {
        const {data} = await fetchMembers();
        const hasActiveStripeSubscriptions = Boolean(data?.meta?.pagination.total);

        // const hasActiveStripeSubscriptions = false; //...
        // this.ghostPaths.url.api('/members/') + '?filter=status:paid&limit=0';
        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to disconnect?',
            prompt: <>
                {hasActiveStripeSubscriptions && <p className="text-red">
                    Cannot disconnect while there are members with active Stripe subscriptions.
                </p>}

                You&lsquo;re about to disconnect your Stripe account {stripeConnectAccountName}
                from this site. This will automatically turn off paid memberships on this site.
            </>,
            okLabel: hasActiveStripeSubscriptions ? '' : 'Disconnect',
            onOk: async (modal) => {
                await deleteStripeSettings(null);
                modal?.remove();
                onClose?.();
            }
        });
    };

    return (
        <section>
            <div className='flex items-center justify-between'>
                <Button disabled={isFetchingMembers} icon='link-broken' label='Disconnect' link onClick={openDisconnectStripeModal} />
                <Button icon='close' size='sm' link onClick={onClose} />
            </div>
            <div className='my-20 flex flex-col items-center'>
                <div className='relative h-20 w-[200px]'>
                    <img alt='Ghost Logo' className='absolute left-10 h-16 w-16' src={GhostLogo} />
                    <img alt='Stripe Logo' className='absolute right-10 h-16 w-16 rounded-2xl shadow-[-1.5px_0_0_1.5px_#fff]' src={StripeLogo} />
                </div>
                <Heading level={3}>You are connected with Stripe!{stripeConnectLivemode ? null : ' (Test mode)'}</Heading>
                <div className='mt-1'>Connected to <strong>Dummy</strong></div>
            </div>
            <div className='flex flex-col items-center'>
                <Heading level={6}>Read next</Heading>
                <a className='w-100 mt-5 flex items-stretch justify-between border border-grey-200 transition-all hover:border-grey-400' href="https://ghost.org/resources/managing-your-stripe-account/?ref=admin" rel="noopener noreferrer" target="_blank">
                    <div className='p-4'>
                        <div className='font-bold'>How to setup and manage your Stripe account</div>
                        <div className='mt-1 text-sm text-grey-800'>Learn how to configure your Stripe account to work with Ghost, from custom branding to payment receipt emails.</div>
                        <div className='mt-3 flex items-center gap-1 text-sm text-grey-800'>
                            <img alt='Ghost Logo' className='h-4 w-4' src={GhostLogoPink} />
                            <strong>Ghost Resources</strong>
                            <span>&middot;</span>
                            <span>by Kym Ellis</span>
                        </div>
                    </div>
                    <div className='flex w-[200px] shrink-0 items-center justify-center overflow-hidden'>
                        <img alt="Bookmark Thumb" className='min-h-full min-w-full shrink-0' src={BookmarkThumb} />
                    </div>
                </a>
            </div>
        </section>
    );
};

const Direct: React.FC<{onClose: () => void}> = ({onClose}) => {
    const {localSettings, updateSetting, handleSave, saveState} = useSettingGroup();
    const [publishableKey, secretKey] = getSettingValues(localSettings, ['stripe_publishable_key', 'stripe_secret_key']);

    const onSubmit = async () => {
        try {
            toast.remove();
            await handleSave();
            onClose();
        } catch (e) {
            if (e instanceof ApiError) {
                showToast({
                    type: 'pageError',
                    message: 'Failed to save settings. Please check you copied both keys correctly.'
                });
                return;
            }

            throw e;
        }
    };

    return (
        <div>
            <Heading level={3}>Connect Stripe</Heading>
            <Form marginBottom={false} marginTop>
                <TextField title='Publishable key' value={publishableKey?.toString()} onChange={e => updateSetting('stripe_publishable_key', e.target.value)} />
                <TextField title='Secure key' value={secretKey?.toString()} onChange={e => updateSetting('stripe_secret_key', e.target.value)} />
                <Button className='mt-5' color='green' disabled={saveState === 'saving'} label='Save Stripe settings' onClick={onSubmit} />
            </Form>
        </div>
    );
};

const StripeConnectModal: React.FC = () => {
    const {config} = useGlobalData();
    const {settings} = useSettings();
    const stripeConnectAccountId = getSettingValue(settings, 'stripe_connect_account_id');
    const {updateRoute} = useRouting();
    const [step, setStep] = useState<'start' | 'connect'>('start');
    const mainModal = useModal();

    const startFlow = () => {
        setStep('connect');
    };

    const close = () => {
        mainModal.remove();
        updateRoute('tiers');
    };

    let contents;

    if (config?.stripeDirect || (
        // Still show Stripe Direct to allow disabling the keys if the config was turned off but stripe direct is still set up
        checkStripeEnabled(settings || [], config || {}) && !stripeConnectAccountId
    )) {
        contents = <Direct onClose={close} />;
    } else if (stripeConnectAccountId) {
        contents = <Connected onClose={close} />;
    } else if (step === 'start') {
        contents = <Start onNext={startFlow} />;
    } else {
        contents = <Connect />;
    }

    return <Modal
        afterClose={() => {
            updateRoute('tiers');
        }}
        cancelLabel=''
        footer={<></>}
        size={stripeConnectAccountId ? 740 : 520}
        title=''
    >
        {contents}
    </Modal>;
};

export default NiceModal.create(StripeConnectModal);
