import pandas as pd
import numpy as np
import re
from itertools import count
from dateutil.parser import parse
from pytz import timezone
from collections import defaultdict
from fuzzywuzzy import process, fuzz
from nameparser import HumanName
import time

# ENTITIES_OF_INTEREST = ['PERSON', 'NORP', 'FAC', 'ORG', 'GPE', 'LOC', 'PRODUCT', 'EVENT', 'WORK_OF_ART', 'LAW',
#                         'LANGUAGE', 'DATE', 'TIME', 'PERCENT', 'MONEY', 'QUANTITY', 'ORDINAL', 'CARDINAL']


def escape_backslashes(s):
    return re.sub(r"\$", r"\\", s)


def unnest(df, col):
    unnested = pd.DataFrame({col: np.concatenate(df[col].values)},
                            index=df.index.repeat(df[col].str.len()))
    return unnested.join(df.drop(col, 1), how="left")


def get_entity_df(df, entity_col):
    melted = pd.melt(df, id_vars=['id'], value_vars=[entity_col])
    melted = melted.loc[melted['value'] != '']
    stacked = pd.concat([pd.Series(row['id'], row['value'])
                         for _, row in melted.iterrows()]).reset_index()
    stacked.columns = ['name', 'emailId']
    stacked['name'] = stacked.name.apply(lambda s: escape_backslashes(s.strip()))
    return stacked


def levenshtein_entities(entity_df):
    entity_df['name'] = entity_df.name.apply(lambda x: (HumanName(x).first + ' ' + HumanName(x).last).strip())
    names = entity_df.groupby('name').count()
    names = names.sort_values(['emailId'], ascending=False)
    names = names.reset_index()

    # quantile_breaks = []
    quantile_breaks = [names.emailId.quantile(x / 10) for x in range(1,11)]
    # for x in range(1, 11):
    #     quantile_breaks.append(names.emailId.quantile(x / 10))

    unique_quantiles = list(set(quantile_breaks))

    choices = defaultdict(list)
    for i, row in names.iterrows():
        if row['emailId'] >= max(unique_quantiles):
            holding = process.extract(row['name'], names['name'][i:len(names)],
                                      limit=unique_quantiles.index(max(unique_quantiles)) * 3)
            choices[row['name']] = [holding[x][0] for x in range(len(holding)) if
                                    (holding[x][0] not in [item for sublist in list(choices.values()) for item in sublist])
                                    & (holding[x][1] >= (100-unique_quantiles.index(max(unique_quantiles)) * 3))]
            # for x in range(len(holding)):
            #     if holding[x][1] >= (100-unique_quantiles.index(max(unique_quantiles)) * 3):
            #         if holding[x][0] not in [item for sublist in list(choices.values()) for item in sublist]:
            #             choices[row['name']].append(holding[x][0])
        else:
            unique_quantiles.pop()

    for i, row in entity_df.iterrows():
        for key, values in choices.items():
            if row['name'] in values:
                row['name'] = key

    return entity_df


def create_entity_node_relationships(df, entity_name, global_id_counter, levenshtein_thresh=None):
    raw_entity_df = get_entity_df(df, entity_name.upper())
    entity_counts = raw_entity_df.name.str.lower().value_counts()
    if "" in entity_counts:
        del entity_counts[""]

    if levenshtein_thresh:
        most_common = entity_counts[:levenshtein_thresh]
        most_common_set = set(most_common.index)

        raw_to_resolved = {}
        resolved_entity_counts = defaultdict(int)

        for name in most_common.index:
            resolved_entity_counts[name] += most_common[name]

        for name in entity_counts.index:
            if name in most_common_set:
                continue
            (candidate_name, candidate_score), = process.extract(name, most_common_set, limit=1, scorer=fuzz.ratio)
            if candidate_score > 89:
                raw_to_resolved[name] = candidate_name
                resolved_entity_counts[candidate_name] += entity_counts[name]
            else:
                resolved_entity_counts[name] += entity_counts[name]
    else:
        raw_to_resolved = {}
        resolved_entity_counts = entity_counts

    resolved_entity_count_df = pd.DataFrame({"mentions": resolved_entity_counts})
    resolved_entity_count_df["id"] = [str(next(global_id_counter)) for _ in range(len(resolved_entity_count_df))]
    resolved_entity_count_df["name"] = resolved_entity_count_df.index
    resolved_entity_count_df = resolved_entity_count_df.set_index("id", drop=False)

    entity_df_n4j = pd.DataFrame({
        "entity{entity}Id:ID".format(entity=entity_name.capitalize()): resolved_entity_count_df.id,
        "name": resolved_entity_count_df.name,
        "mentions:int": resolved_entity_count_df.mentions,
        ":LABEL": "Entity_{entity}".format(entity=entity_name.capitalize())
    })

    save_node = "neo4j-csv/entity_{entity}.csv".format(entity=entity_name)
    entity_df_n4j.to_csv(save_node, index=False)

    raw_entity_df = raw_entity_df.drop_duplicates()
    raw_entity_df["name_format"] = raw_entity_df.name
    raw_entity_df["name_lower"] = raw_entity_df.name.str.lower()
    raw_entity_df["name"] = raw_entity_df.name.str.lower().apply(
        lambda n: raw_to_resolved[n] if n in raw_to_resolved else n)
    relationship_df = pd.merge(resolved_entity_count_df, raw_entity_df, on='name')

    mentions_n4j = pd.DataFrame({
        ":START_ID": relationship_df.emailId,
        ":END_ID": relationship_df.id,
        "as": relationship_df.name_format,
        ":TYPE": "MENTION"
    })

    save_relationship = "neo4j-csv/mentions_{entity}.csv".format(entity=entity_name)
    mentions_n4j.to_csv(save_relationship, index=False)


def spacy_to_neo4j_etl(pkl_path='processed_emails_nocoref.pkl'):
    # generator for globally unique IDs in neo4j
    global_id_counter = count()

    email_df = pd.read_pickle(pkl_path)
    email_df["to"] = email_df.to.apply(lambda s: s.strip().split(","))
    email_df["subject"] = email_df.subject.fillna("").apply(lambda s: escape_backslashes(s.strip()))
    email_df["body"] = email_df.body.fillna("").apply(lambda s: escape_backslashes(s.strip()))

    email_df_n4j = pd.DataFrame({
        "emailId:ID": email_df.id,
        "to:string[]": email_df.to.apply(lambda s: ";".join(s)),
        "from": email_df["from"],
        "subject": email_df.subject,
        "body": email_df.body,
        "date:datetime": email_df.date,
        ":LABEL": "Email"
    })

    email_df_n4j.to_csv("neo4j-csv/emails.csv", index=False)

    email_unnest_df = unnest(email_df[["id", "to", "from"]], col="to")
    email_unnest_df = email_unnest_df[email_unnest_df.to != email_unnest_df["from"]]

    persons_df = pd.DataFrame({"incoming": email_unnest_df.to.value_counts(),
                               "outgoing": email_df["from"].value_counts()}).fillna(0).astype(int)
    persons_df["email"] = persons_df.index
    persons_df = persons_df.sort_values(by=["email"])
    persons_df["id"] = [str(next(global_id_counter)) for _ in range(len(persons_df))]
    persons_df.index = persons_df.id
    persons_df_n4j = pd.DataFrame({
        "personId:ID": persons_df.id,
        "email": persons_df.email,
        "incoming:int": persons_df.incoming,
        "outgoing:int": persons_df.outgoing,
        ":LABEL": "Person"
    })
    persons_df_n4j.to_csv("neo4j-csv/persons.csv", index=False)

    email_to_person_id_map = persons_df.index.to_series()
    email_to_person_id_map.index = persons_df.email

    rel_counts_df = email_unnest_df.groupby(["from", "to"], as_index=False).count().rename(columns={"id": "counts"})
    rel_counts_df_n4j = pd.DataFrame({
        ":START_ID": email_to_person_id_map[rel_counts_df["from"]].values,
        ":END_ID": email_to_person_id_map[rel_counts_df.to].values,
        "count:int": list(rel_counts_df.counts),
        ":TYPE": "EMAILS_TO"
    })

    rel_counts_df_n4j.to_csv("neo4j-csv/emails_to.csv", index=False)

    from_df_n4j = pd.DataFrame({
        ":START_ID": email_df.id,
        ":END_ID": email_to_person_id_map[email_df["from"]].values,
        ":TYPE": "FROM"
    })
    from_df_n4j.to_csv("neo4j-csv/from.csv", index=False)

    to_df_n4j = pd.DataFrame({
        ":START_ID": email_unnest_df.id,
        ":END_ID": email_to_person_id_map[email_unnest_df.to].values,
        ":TYPE": "TO"
    })
    to_df_n4j.to_csv("neo4j-csv/to.csv", index=False)

    ### Entities
    entity_list = ['person', 'org', 'money', 'norp', 'fac', 'gpe', 'loc', 'date', 'time', 'quantity']
    for entity in entity_list:
        print(entity)
        if entity == 'person':
            create_entity_node_relationships(email_df, entity, global_id_counter, levenshtein_thresh=2000)
        else:
            create_entity_node_relationships(email_df, entity, global_id_counter)


if __name__ == '__main__':
    start_time = time.time()
    spacy_to_neo4j_etl(pkl_path='processed_emails_nocoref.pkl')
    print('Time elapsed: {} min'.format((time.time() - start_time) / 60))

