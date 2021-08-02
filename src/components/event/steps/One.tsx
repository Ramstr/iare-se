import { Heading } from "@chakra-ui/react";
import Box from "components/motion/Box";
import { motion } from "framer-motion";
import React from "react";
import { ComponentEventTickets, Maybe } from "types/strapi";
import { EventTicketItem } from "../EventTicketItem";
import { EventTicketList } from "../EventTicketList";

interface Props {
    label: string;
    intendedTickets: string[] | undefined;
    tickets: Maybe<ComponentEventTickets> | undefined;
    handleOrderUpdate: any;
}

export const One = ({
    label,
    intendedTickets,
    tickets,
    handleOrderUpdate,
}: Props) => {
    return (
        <motion.div>
            <Heading size="lg" fontWeight="700" mb={16}>
                {label}
            </Heading>
            {intendedTickets && intendedTickets?.length > 0 && (
                <EventTicketList
                    tickets={tickets}
                    onChange={handleOrderUpdate}
                    currentTickets={intendedTickets}
                >
                    {({ radio, ticket }) => (
                        <EventTicketItem
                            {...radio}
                            ticket={{
                                ...ticket,
                                currency: "kr",
                            }}
                        />
                    )}
                </EventTicketList>
            )}
        </motion.div>
    );
};
