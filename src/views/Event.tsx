import { useBreakpointValue } from "@chakra-ui/media-query";
import {
    Box,
    Button,
    Center,
    Flex,
    Heading,
    Icon,
    IconButton,
    Progress,
    Spacer,
    Stack,
    StackDivider,
    VStack,
    Text,
} from "@chakra-ui/react";
import { Link, Element } from "react-scroll";
import AccessibleLink from "components/AccessibleLink";
import { EventPasswordProtection } from "components/event/EventPasswordProtection";
import { Options } from "components/event/steps/Options";
import { OrderComplete } from "components/event/steps/OrderComplete";
import { OrderFinalize } from "components/event/steps/OrderFinalize";
import { OrderSummary } from "components/event/steps/OrderSummary";
import { OtherComment } from "components/event/steps/OtherComment";
import { Tickets } from "components/event/steps/Tickets";
import { VStepper } from "components/event/VStepper";
import { MDXLayout } from "components/mdx/Layout";
import { SkeletonSpinner } from "components/SkeletonSpinner";
import { isAfter, isBefore } from "date-fns";
import { motion } from "framer-motion";
import { useSanity } from "hooks/use-check-error";
import { useNets } from "hooks/use-nets";
import { Deta } from "lib/deta";
import { Strapi } from "lib/strapi";
import { MDXRemoteSerializeResult } from "next-mdx-remote";
import useTranslation from "next-translate/useTranslation";
import { useRouter } from "next/router";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { isMobileSafari } from "react-device-detect";
import {
    useForm,
    FieldPath,
    UnpackNestedValue,
    FieldPathValue,
} from "react-hook-form";
import { BsChevronDoubleDown } from "react-icons/bs";
import { FaMapMarkerAlt } from "react-icons/fa";
import { IoMdArrowDropleft } from "react-icons/io";
import { MdDateRange } from "react-icons/md";
import { validatePassword } from "state/checkout";
import { useHydrater } from "state/layout";
import { useSetLocaleSlug } from "state/locale";
import { LayoutProps } from "types/global";
import { Option } from "components/Autocomplete";
import {
    ComponentEventTickets,
    ComponentEventInternalTicket,
    ComponentEventOtherComment,
    Allergy,
    Diet,
    Event,
} from "types/strapi";
import _ from "underscore";
import { getDate } from "utils/dates";
import { generateQRCode } from "utils/images";
import defaultEvent from "../../prefetch/static/event.json";
import job from "models/job";
import { NextSeo } from "next-seo";
import { getPage, makeTitle } from "utils/seo";

interface Props {
    event: Event;
    mdx: MDXRemoteSerializeResult;
    diets: Diet[];
    allergies: Allergy[];
}

export interface DefaultFieldValues {
    password: string;
    diets: Option[];
    allergens: Option[];
    ticket: string;
    orderIsFree: boolean;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    intentionId: string;
    otherCommentResponse: string;
}

export type TicketData = Partial<DefaultFieldValues> & {
    qrcode: string;
    skipMessage?: boolean;
};

const View = ({
    header,
    footer,
    /* @ts-ignore */
    event = defaultEvent,
    diets,
    allergies,
    localeSlugs,
    error,
    mdx,
}: LayoutProps<Props>) => {
    useSanity(error);
    useSetLocaleSlug(localeSlugs);
    useHydrater({ header, footer });

    const { t, lang } = useTranslation("event");
    const router = useRouter();

    const [ticketData, setTicketData] = useState<TicketData>();
    const {
        register,
        control,
        watch,
        setFocus,
        setValue,
        getValues,
        handleSubmit,
        formState: { errors, isSubmitting },
        formState,
    } = useForm<DefaultFieldValues>({
        defaultValues: {
            password: "",
            diets: [],
            allergens: [],
            ticket: "",
            orderIsFree: false,
            otherCommentResponse: "",
        },
    });

    const onSubmit = (data: any) => finalizeOrder(data);

    const [status, setStatus] = useState("pending");

    const isBeforeDeadline = useMemo(
        () => isAfter(new Date(event.deadline), new Date()),
        [event.deadline]
    );

    const isAvailable = useMemo(() => status !== "failed", [status]);

    const {
        isLoaded,
        reset,
        hydrateCheckout,
        setCheckoutConfig,
        setTheme,
        setLanguage,
        setPaymentId,
        getPaymentId,
        withCheckout,
        initCheckout,
    } = useNets({
        on3DSHandler: (paymentId) => {},
        onCompleteHandler: ({ paymentId }) => {
            finalizeOrder();
        },
        fullfillmentId: event.fullfillmentUID as string,
        checkoutSrc: process.env.NEXT_PUBLIC_CHECKOUT_SRC,
    });

    const supportedLanguages = useCallback(
        (lang) => (lang === "en" ? "en-GB" : "sv-SE"),
        []
    );

    const finalizeOrder = useCallback(
        async (order: DefaultFieldValues = getValues()) => {
            const {
                intentionId,
                orderIsFree,
                diets: _diets = [],
                allergens: _allergens = [],
                otherCommentResponse,
            } = order;
            const diets = _diets.map((e) => ({
                id: parseInt(e.value),
                name: e.label,
            }));
            const allergens = _allergens.map((e) => ({
                id: parseInt(e.value),
                name: e.label,
            }));

            let res;
            if (orderIsFree) {
                // send customer details to strapi
                const {
                    firstName,
                    lastName,
                    email,
                    phoneNumber,
                    otherCommentResponse,
                } = order;
                const url = Deta`/intent/${intentionId}/complete`;
                res = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        firstName,
                        lastName,
                        email,
                        phoneNumber,
                        diets,
                        allergens,
                        otherCommentResponse,
                    }),
                });
            } else {
                const url = Strapi`/orders/${intentionId}/diets`;
                var body: any = _.reduce(
                    [
                        {
                            label: "diets",
                            collection: _diets,
                        },
                        {
                            label: "allergens",
                            collection: _allergens,
                        },
                    ],
                    (prev, { label, collection }) => {
                        if (collection.length > 0) {
                            return {
                                ...prev,
                                [label]: collection.map((d) => ({
                                    id: parseInt(d.value),
                                    name: d.label,
                                })),
                            };
                        }
                        return prev;
                    },
                    {}
                );

                // Add data to body
                body.otherCommentReponse = otherCommentResponseResults;

                res = await fetch(url, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                });
            }
            if (res.ok) {
                produceTicket(order);
            }
        },
        []
    );

    const produceTicket = useCallback(
        async (
            order: Omit<
                DefaultFieldValues,
                "password" | "ticket" | "phoneNumber"
            > & { skipMessage?: boolean }
        ) => {
            let consumer;
            const {
                orderIsFree,
                firstName,
                lastName,
                email,
                diets,
                allergens,
                intentionId,
                skipMessage,
                otherCommentResponse,
            } = order;
            const qrcode = await generateQRCode(intentionId);
            const { paymentId } = getPaymentId();
            if (orderIsFree) {
                consumer = {
                    firstName,
                    lastName,
                    email,
                    diets,
                    allergens,
                    qrcode,
                    intentionId,
                    skipMessage,
                    otherCommentResponse,
                };
            } else if (paymentId) {
                const url = Deta`/intent/${paymentId}`;
                const res = await fetch(url, { method: "GET" });
                if (res.ok) {
                    const data = await res.json();

                    consumer = {
                        diets,
                        allergens,
                        firstName:
                            data.payment.consumer.privatePerson.firstName,
                        lastName: data.payment.consumer.privatePerson.lastName,
                        email: data.payment.consumer.privatePerson.email,
                        intentionId,
                        qrcode,
                        skipMessage,
                        otherCommentResponse,
                    };
                }
            } else {
                return;
            }
            setTicketData(consumer);
            setActiveStep(steps.length);
        },
        []
    );

    const isFree = useCallback(
        (currentTicket) => {
            const tickets = event?.tickets?.Tickets ?? [];
            const ticket = tickets.find((t) => t?.ticketUID === currentTicket);
            return ticket?.price === 0;
        },
        [event?.tickets?.Tickets]
    );

    const useCreateSetter = <T extends FieldPath<DefaultFieldValues>>(
        name: T,
        sideEffect?: (
            value: UnpackNestedValue<FieldPathValue<DefaultFieldValues, T>>
        ) => void
    ) => {
        return useCallback(
            (
                value: UnpackNestedValue<FieldPathValue<DefaultFieldValues, T>>
            ) => {
                setValue(name, value);
                if (sideEffect) {
                    sideEffect(value);
                }
            },
            []
        );
    };

    const useCreateGetter = <T extends FieldPath<DefaultFieldValues>>(
        name: T
    ) =>
        useMemo(() => {
            return getValues(name);
        }, [watch(name)]);

    const setTicket = useCreateSetter("ticket", (currentTicket) => {
        setValue("orderIsFree", isFree(currentTicket));
    });

    const setDiets = useCreateSetter("diets");
    const setAllergens = useCreateSetter("allergens");

    const setIntentionId = useCreateSetter("intentionId");

    const orderIsFree = useCreateGetter("orderIsFree");

    const dietResults = useCreateGetter("diets");
    const allergenResults = useCreateGetter("allergens");

    const setOtherCommentResponse = useCreateSetter("otherCommentResponse");
    const otherCommentResponseResults = useCreateGetter("otherCommentResponse");

    useEffect(() => {
        hydrateCheckout(
            async ({ get, validate, createIntention, ticketsAvailable }) => {
                setStatus("pending");
                const id = get("id");
                const _ticketsAvailable = await ticketsAvailable(
                    parseInt(event.id),
                    event.maxTickets || 9999
                );
                if (id && isBeforeDeadline && _ticketsAvailable) {
                    const {
                        intentionId,
                        paymentId,
                        ticketId,
                        consumer,
                        status,
                    } = await validate(id);
                    if (ticketId) setTicket(ticketId);
                    if (intentionId) setIntentionId(intentionId);
                    if (consumer && status === "success" && intentionId) {
                        produceTicket({
                            intentionId,
                            diets: consumer.diets.map((d) => ({
                                value: `${d.id}`,
                                label: d.name,
                            })),
                            allergens: consumer.allergens.map((d) => ({
                                value: `${d.id}`,
                                label: d.name,
                            })),
                            email: consumer.email,
                            firstName: consumer.firstName,
                            lastName: consumer.lastName,
                            orderIsFree: isFree(ticketId),
                            skipMessage: true,
                            otherCommentResponse: consumer.otherCommentResponse,
                        });
                    } else {
                        setActiveStep(0);
                    }
                    setStatus("ready");
                    if (status) {
                        return { intentionId, paymentId };
                    }
                }
                if (isBeforeDeadline && _ticketsAvailable) {
                    const { intentionId, paymentId, ticketId } =
                        await createIntention();
                    router.replace(
                        `/event/${event.slug}?id=${intentionId}`,
                        undefined,
                        {
                            shallow: true,
                        }
                    );
                    if (ticketId) setTicket(ticketId);
                    if (intentionId) setIntentionId(intentionId);
                    setActiveStep(0);
                    setStatus("ready");

                    return { intentionId, paymentId };
                }

                setStatus("failed");
                return { intentionId: undefined, paymentId: undefined };
            }
        );

        setCheckoutConfig({
            checkoutKey: process.env.NEXT_PUBLIC_CHECKOUT_KEY as string,
            language: supportedLanguages(lang),
            containerId: "checkout",
        });

        setTheme({
            textColor: "#000",
            primaryColor: "#1A2123",
            linkColor: "#357AA5",
            backgroundColor: "#fff",
            fontFamily: "Source Sans Pro",
            placeholderColor: "#767676",
            outlineColor: "#BEBEBE",
            primaryOutlineColor: "#976E49",
        });
    }, []);

    const handleOrder = withCheckout<string>(
        async ({ intentionId }, ticketId) => {
            setStatus("pending");
            if (!intentionId || !event.fullfillmentUID || !ticketId) {
                setStatus("failed");
                return;
            }
            const url = Deta`/intent/${event.fullfillmentUID}/${intentionId}`;
            const res = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    tickets: [ticketId],
                }),
            });

            if (res.ok) {
                setTicket(ticketId);
                const { paymentId } = await res.json();
                setPaymentId(paymentId);
                setStatus("ready");
            } else {
                setStatus("failed");
            }
        }
    );

    useEffect(() => {
        const handleLanguage = withCheckout(() => {
            setLanguage(supportedLanguages(lang));
        });

        handleLanguage();
    }, [lang, setLanguage, supportedLanguages]);

    const [beforeDeadline] = useState(
        isBefore(new Date(), new Date(event.deadline))
    );

    const handlePasswordSubmit = async () => {
        const password = getValues("password");
        const isValid = await validatePassword(event.id, password);
        if (isValid) {
            setActiveStep(1);
        }
        return isValid;
    };

    const [_activeStep, setActiveStep] = useState(-1);

    const activeStep = useMemo(() => {
        return event.passwordProtected ? _activeStep : _activeStep + 1;
    }, [_activeStep, event.passwordProtected]);

    const steps = useMemo(() => {
        return [
            {
                label: t("step.zero"), // Password
                isVisible: event.passwordProtected !== null,
            },
            {
                label: t("step.one"), // Tickets
                isVisible: true,
            },
            {
                label: t("step.two"), // Diets
                isVisible: event.servingOptions?.servingFood === true,
            },
            {
                label: t("step.three"), // Options (comment-field)
                isVisible: event.otherCommentLabel !== null,
            },
            {
                label: t("step.four"), // Summary
                isVisible: true,
            },
            {
                label: t("step.five"), // Checkout
                isVisible: true,
            },
        ];
    }, [
        event.passwordProtected,
        event.otherCommentLabel,
        event.servingOptions?.servingFood,
        t,
    ]);

    const nActiveSteps = useMemo(() => {
        var activeSteps = 0;
        steps.forEach(function (step, index) {
            if (step.isVisible) {
                activeSteps += 1;
            }
        });
        return activeSteps;
    }, [steps]);

    const goForward = useCallback(() => {
        if (activeStep === steps.length - 2 && !orderIsFree) {
            initCheckout();
        }
        var nextStep = Math.max(Math.min(_activeStep + 1, steps.length - 1), 0);

        while (
            !steps[nextStep + (event.passwordProtected ? 0 : 1)].isVisible &&
            nextStep < steps.length - 1
        ) {
            nextStep += 1;
        }

        setActiveStep(nextStep);
    }, [
        activeStep,
        event.passwordProtected,
        initCheckout,
        orderIsFree,
        steps.length,
    ]);

    const goBackward = useCallback(() => {
        if (activeStep === steps.length - 1) {
            reset();
        }

        var nextStep = Math.min(Math.max(_activeStep - 1, 0), steps.length - 1);

        while (!steps[nextStep + (event.passwordProtected ? 0 : 1)].isVisible) {
            nextStep -= 1;
        }

        setActiveStep(Math.max(nextStep, 0));
    }, [activeStep, event.passwordProtected, reset, steps.length]);

    const isAboveMd = useBreakpointValue({ base: false, lg: true });

    const MotionIconButton = motion(IconButton);

    const formStep = useCallback(
        (step) => {
            return activeStep >= step && (!ticketData || step === steps.length);
        },
        [activeStep, steps.length, ticketData]
    );

    useEffect(() => {
        const handleChangeRoute = () => {
            if (activeStep <= 1) {
                return;
            }
            if (window.confirm(t("beforeLeave"))) {
                return;
            } else {
                router.events.emit("routeChangeError");
                throw "routeChange aborted.";
            }
        };
        router.events.on("routeChangeStart", handleChangeRoute);
        return () => {
            router.events.off("routeChangeStart", handleChangeRoute);
        };
    }, [activeStep]);

    const seoTitle = makeTitle(
        t("seo:event.title", { event: event.title }),
        false
    );
    return (
        <React.Fragment>
            <NextSeo
                title={seoTitle}
                openGraph={{
                    type: "website",
                    url: getPage(("event/" + event.slug) as string),
                    title: seoTitle,
                    description: event?.description ?? "",
                    images: [
                        {
                            url: event.banner?.url ?? "",
                            width: event?.banner?.width ?? 0,
                            height: event?.banner?.height ?? 0,
                            alt: `Hero image for ${event.title}`,
                        },
                    ],
                }}
            />
            <Flex
                overflow="hidden"
                direction="column"
                bg="white"
                pos="relative"
                px={{ base: 3, md: 16 }}
                pt={{ base: 4, md: 10 }}
                pb={{ base: 8, md: 16 }}
            ></Flex>
        </React.Fragment>
    );
};

export default View;
